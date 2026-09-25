#!/usr/bin/env node
/**
 * Chroma 向量库治理脚本（待办②：Chroma 数据治理与生产部署方式）
 *
 * 本机开发用 Python venv 跑 Chroma（无 Docker 环境）：
 *   - 数据目录   H:\BP2\.chroma-data（已在 .gitignore）
 *   - venv       H:\BP2\.venv-chroma（chromadb 1.5.9，CLI 为独立 Rust 二进制）
 *   - 服务地址   http://127.0.0.1:8000（REST /api/v2，v1 路径已废弃返回 410）
 *   - PID 文件   .chroma-data/chroma.pid（start 写入 / stop 读取）
 *
 * 用法：
 *   node scripts/chroma.mjs start   启动 Chroma（已运行则跳过；日志 .chroma-data/chroma.*.log）
 *   node scripts/chroma.mjs stop    停止 Chroma（按 PID 文件精确终止，不误伤 node）
 *   node scripts/chroma.mjs status  心跳 + collections + count + 数据目录大小
 *   node scripts/chroma.mjs reset   删除 CHROMA_COLLECTION（幂等；不存在视为已清空）
 *   node scripts/chroma.mjs reset-data  数据目录损坏时（start 超时且日志已 listening）备份并重建空目录
 *
 * 坑备忘（2026-09-26 实测）：
 *   - chromadb 1.5.9（Rust 版）API 为 /api/v2/*；/api/v1/* 已废弃（410 Gone）。
 *   - node spawn 的子进程在父进程退出时被 Job Object 终止 → 必须 detached:true 脱离。
 *   - 本环境 node 子进程 PATH 精简（无 powershell/netstat）→ 进程管理全用 Node 原生
 *     （PID 文件 + process.kill，Windows 上即 TerminateProcess）。
 *   - 旧数据目录 SQLite 未干净关闭（进程被强杀）会导致 chroma 打印 listening 后静默退出
 *     → 用 reset-data 备份并重建。
 *
 * 生产部署（见 deploy/chroma.docker-compose.yml）：Docker 或托管 Chroma，
 * 服务进程把 CHROMA_URL 指向远端（vectorStore.js 已按协议自动启用 https/ssl）。
 */
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROMA_DATA = join(ROOT, '.chroma-data');
const CHROMA_OUT_LOG = join(CHROMA_DATA, 'chroma.out.log');
const CHROMA_ERR_LOG = join(CHROMA_DATA, 'chroma.err.log');
const CHROMA_PID_FILE = join(CHROMA_DATA, 'chroma.pid');
const HOST = process.env.CHROMA_HOST || '127.0.0.1';
const PORT = Number(process.env.CHROMA_PORT || 8000);
const COLLECTION = process.env.CHROMA_COLLECTION || 'virtual_utopia_rag';
const BASE = `http://${HOST}:${PORT}/api/v2`;
const COLLECTION_BASE = `${BASE}/tenants/default_tenant/databases/default_database/collections`;
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 500;

const venvChroma = () =>
  process.platform === 'win32'
    ? join(ROOT, '.venv-chroma', 'Scripts', 'chroma.exe')
    : join(ROOT, '.venv-chroma', 'bin', 'chroma');

const heartbeat = async () => {
  try {
    const res = await fetch(`${BASE}/heartbeat`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const readPid = () => {
  try {
    const pid = Number(readFileSync(CHROMA_PID_FILE, 'utf8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};

const isPidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const listCollections = async () => {
  const res = await fetch(COLLECTION_BASE, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    throw new Error(`Chroma listCollections 失败: HTTP ${res.status}`);
  }
  return res.json();
};

const collectionCount = async (name) => {
  const res = await fetch(
    `${COLLECTION_BASE}/${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(3000) },
  );
  if (!res.ok) return null;
  const detail = await res.json();
  return typeof detail?.count === 'number' ? detail.count : null;
};

const dirSize = async (dir) => {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else {
      total += (await stat(full)).size;
    }
  }
  return total;
};

const start = async () => {
  const exe = venvChroma();
  if (!existsSync(exe)) {
    console.error(
      `[chroma] 未找到 venv Chroma: ${exe}\n` +
        `  本机需先建 venv（Python 3.10+）：\n` +
        `  python -m venv .venv-chroma\n` +
        `  .venv-chroma\\Scripts\\pip install chromadb==1.5.9`,
    );
    process.exit(1);
  }

  if (await heartbeat()) {
    console.log(
      `[chroma] 已在运行（PID ${readPid() ?? '未知'}）: http://${HOST}:${PORT}`,
    );
    return;
  }

  if (!existsSync(CHROMA_DATA)) {
    await mkdir(CHROMA_DATA, { recursive: true });
  }

  // detached:true 脱离 Job Object，父进程退出后子进程仍存活（否则会被终止——踩过坑）。
  // 日志用 openSync fd 传给子进程（子进程持有 fd 副本，父退出不影响写日志）。
  const outFd = openSync(CHROMA_OUT_LOG, 'a');
  const errFd = openSync(CHROMA_ERR_LOG, 'a');
  const child = spawn(
    exe,
    ['run', '--path', CHROMA_DATA, '--host', HOST, '--port', String(PORT)],
    {
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    },
  );
  writeFileSync(CHROMA_PID_FILE, String(child.pid), 'utf8');
  child.unref();

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await heartbeat()) {
      console.log(
        `[chroma] 已启动（PID ${child.pid}）: http://${HOST}:${PORT}` +
          `（日志 ${CHROMA_OUT_LOG} / ${CHROMA_ERR_LOG}）`,
      );
      return;
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }

  console.error(
    `[chroma] 启动后 ${HEALTH_TIMEOUT_MS / 1000}s 内未通过心跳，请查日志 ${CHROMA_OUT_LOG} / ${CHROMA_ERR_LOG}\n` +
      `  [诊断] 若日志已显示 listening 但端口不通，多为旧数据目录 SQLite 未干净关闭` +
      `（进程被强杀）导致，可执行：node scripts/chroma.mjs reset-data\n` +
      `  （reset-data 会把 .chroma-data 备份为 .corrupt-<时间戳> 并重建空目录，不删除数据）`,
  );
  process.exit(1);
};

const stop = async () => {
  if (await heartbeat()) {
    const pid = readPid();
    if (pid && isPidAlive(pid)) {
      // Windows 上 process.kill(pid, 'SIGTERM') 即 TerminateProcess
      process.kill(pid, 'SIGTERM');
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && (await heartbeat())) {
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log(`[chroma] 已停止（PID ${pid}）`);
    } else {
      console.error(
        `[chroma] 服务在运行但 PID 文件不可用（${CHROMA_PID_FILE}），` +
          '请手动终止监听 8000 端口的进程',
      );
      process.exit(1);
    }
  } else {
    console.log('[chroma] 未在运行');
  }
  try {
    unlinkSync(CHROMA_PID_FILE);
  } catch {
    // 忽略：PID 文件可能不存在
  }
};

const status = async () => {
  if (!(await heartbeat())) {
    console.log('[chroma] 未在运行（可用 node scripts/chroma.mjs start）');
    process.exit(1);
  }
  const collections = await listCollections();
  console.log(
    `[chroma] 运行中（PID ${readPid() ?? '未知'}）: http://${HOST}:${PORT}`,
  );
  console.log(`[chroma] collections（${collections.length}）:`);
  for (const item of collections) {
    const count = await collectionCount(item.name);
    console.log(
      `  - ${item.name}  ${count === null ? '(count 不可用)' : `count=${count}`}`,
    );
  }
  const size = await dirSize(CHROMA_DATA);
  console.log(`[chroma] 数据目录 ${CHROMA_DATA}（${(size / 1024 / 1024).toFixed(2)} MB）`);
};

const reset = async () => {
  if (!(await heartbeat())) {
    console.log(
      '[chroma] 未在运行，无需 reset（start 后重试或直接删除 .chroma-data）',
    );
    process.exit(1);
  }
  const res = await fetch(
    `${COLLECTION_BASE}/${encodeURIComponent(COLLECTION)}`,
    {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (res.ok || res.status === 404) {
    console.log(
      res.status === 404
        ? `[chroma] collection ${COLLECTION} 不存在（已空），无需删除`
        : `[chroma] 已删除 collection ${COLLECTION}（HTTP ${res.status}）`,
    );
  } else {
    console.error(`[chroma] 删除失败: HTTP ${res.status}`);
    process.exit(1);
  }
};

const resetData = async () => {
  if (await heartbeat()) {
    console.log(
      '[chroma] 服务正在运行，请先 node scripts/chroma.mjs stop 再执行 reset-data',
    );
    process.exit(1);
  }
  if (!existsSync(CHROMA_DATA)) {
    console.log('[chroma] 数据目录不存在，无需重置');
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${CHROMA_DATA}.corrupt-${ts}`;
  await rename(CHROMA_DATA, backup);
  // 顺手把测试残留目录（如有）一并备份，保持工作区干净
  const tmpDir = join(ROOT, '.chroma-tmp');
  if (existsSync(tmpDir)) {
    await rename(tmpDir, `${tmpDir}.corrupt-${ts}`);
  }
  await mkdir(CHROMA_DATA, { recursive: true });
  console.log(`[chroma] 已备份旧数据到 ${backup}`);
  console.log(`[chroma] 已重建空数据目录 ${CHROMA_DATA}`);
  console.log('[chroma] 确认无误后可删除备份目录（仅用于回退）');
};

const main = async () => {
  const command = process.argv[2];
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'status') await status();
  else if (command === 'reset') await reset();
  else if (command === 'reset-data') await resetData();
  else {
    console.log(
      '用法: node scripts/chroma.mjs <start|stop|status|reset|reset-data>\n' +
        `  start       启动 Chroma（数据 ${CHROMA_DATA}，地址 ${BASE}）\n` +
        `  stop        按 PID 文件精确停止\n` +
        `  status      心跳 + collections + 数据目录大小\n` +
        `  reset       删除 collection ${COLLECTION}（幂等）\n` +
        `  reset-data  数据目录损坏时（start 超时且日志已 listening）备份并重建空目录`,
    );
  }
};

main().catch((error) => {
  console.error('[chroma] 异常: ' + (error && error.message));
  process.exit(1);
});
