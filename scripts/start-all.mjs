#!/usr/bin/env node
/**
 * 服务启动编排脚本：按依赖顺序拉起后端服务并做健康探测。
 *
 * 用法：
 *   node scripts/start-all.mjs
 *
 * 启动顺序：phase5(3300) -> phase6(3400)（前端另行启动，见 README）。
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 500;

const venvChromaPath = () =>
  process.platform === 'win32'
    ? join(ROOT, '.venv-chroma', 'Scripts', 'chroma.exe')
    : join(ROOT, '.venv-chroma', 'bin', 'chroma');

const SERVICES = [
  {
    name: 'phase5',
    entry: 'backend/src/phase5/server.js',
    // 同时探测 localhost 与 127.0.0.1：Node 在 Windows 上会按 host 解析结果只绑定
    // IPv6(::1) 或只绑定 IPv4，写死单一地址会被误判为「健康检查超时」并杀掉服务。
    health: [
      'http://localhost:3300/api/phase5/health',
      'http://127.0.0.1:3300/api/phase5/health',
    ],
    required: true,
  },
  {
    name: 'phase6',
    entry: 'backend/src/phase6/server.js',
    health: [
      'http://localhost:3400/health',
      'http://127.0.0.1:3400/health',
    ],
    required: true,
  },
  {
    // 待办②：Chroma 向量库纳入统一编排（可选）。本机无 Docker 用 venv 跑；
    // 若未安装 venv 或启动失败，业务服务仍可启动，仅 RAG 功能降级。
    name: 'chroma',
    kind: 'venv',
    entry: 'node_modules/.bin/chroma', // 占位，实际按平台解析 .venv-chroma
    args: ['run', '--path', '.chroma-data', '--host', '127.0.0.1', '--port', '8000'],
    health: [
      'http://localhost:8000/api/v2/heartbeat',
      'http://127.0.0.1:8000/api/v2/heartbeat',
    ],
    required: false,
  },
];

const children = [];

const waitForHealth = async (urls, timeoutMs) => {
  const candidates = Array.isArray(urls) ? urls : [urls];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const url of candidates) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return url;
      } catch {
        // 未就绪，继续等待
      }
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  return '';
};

const stopAll = () => {
  for (const child of children) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
  process.exit(1);
};

process.on('SIGINT', () => {
  console.log('[start-all] 收到 SIGINT，停止所有服务');
  stopAll();
});
process.on('SIGTERM', () => stopAll());

const main = async () => {
  for (const svc of SERVICES) {
    console.log('[start-all] 启动 ' + svc.name + ' ...');
    const child =
      svc.kind === 'venv'
        ? spawn(venvChromaPath(), svc.args.map((a) => (a === '.chroma-data' ? join(ROOT, '.chroma-data') : a)), {
            stdio: 'inherit',
          })
        : spawn(process.execPath, [resolve(ROOT, svc.entry)], {
            stdio: 'inherit',
          });
    children.push(child);

    const ready = await waitForHealth(svc.health, HEALTH_TIMEOUT_MS);
    if (ready) {
      console.log('[start-all] ' + svc.name + ' 就绪');
    } else if (svc.required) {
      console.error('[start-all] ' + svc.name + ' 健康检查超时，终止');
      stopAll();
      return;
    } else {
      console.warn('[start-all] ' + svc.name + ' 健康检查未通过（非必需）');
    }
  }

  console.log('[start-all] 全部必需服务已就绪');
};

main().catch((error) => {
  console.error('[start-all] 异常: ' + (error && error.message));
  stopAll();
});
