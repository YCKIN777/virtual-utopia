#!/usr/bin/env node
/**
 * 服务启动编排脚本：按依赖顺序以 detached 独立进程拉起全部服务并做健康探测。
 *
 * 用法：
 *   node scripts/start-all.mjs            # 启动全部服务（detached，进程独立存活）
 *   node scripts/start-all.mjs stop       # 按 PID 文件停止全部服务
 *   node scripts/start-all.mjs status     # 按 PID 文件检查服务存活
 *
 * 启动顺序：phase5(3300) -> phase6(3400) -> chroma(8000, 可选) -> scene(3000)
 *           -> 外层壳 frontend(5173) -> 3D 世界 virtual-utopia(5175)
 *           -> 管理后台 phase6-admin(5174)。
 *
 * P5.1-④：全部子进程 detached:true + 日志重定向 + PID 文件管理。
 * 主进程启动完即退出，服务不随会话终止被级联杀死（此前 run_in_background /
 * 非 detached spawn 会随执行会话结束全灭，曾导致 3D 世界登录 503）。
 *
 * 环境变量：
 *   PHASE5_AUTH_SECRET / PHASE5_BOOTSTRAP_ADMIN_PASSWORD 可覆盖 phase5 默认值
 *   （默认 changeme / utopia2026，与 backend/.env.example 一致，本地预览用）。
 */
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = join(ROOT, '.run');
const LOG_DIR = join(ROOT, 'logs');
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 500;
const BACKEND_ENV = 'backend/.env';
const VITE_BIN = 'node_modules/vite/bin/vite.js';

const venvChromaPath = () =>
  process.platform === 'win32'
    ? join(ROOT, '.venv-chroma', 'Scripts', 'chroma.exe')
    : join(ROOT, '.venv-chroma', 'bin', 'chroma');

// phase5 不读 .env（config 校验必填），统一在此注入（可被环境变量覆盖）。
const phase5Secrets = {
  PHASE5_AUTH_SECRET: process.env.PHASE5_AUTH_SECRET || 'changeme',
  PHASE5_BOOTSTRAP_ADMIN_PASSWORD:
    process.env.PHASE5_BOOTSTRAP_ADMIN_PASSWORD || 'utopia2026',
};

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
    envFile: BACKEND_ENV,
    extraEnv: phase5Secrets,
    required: true,
  },
  {
    name: 'phase6',
    entry: 'backend/src/phase6/server.js',
    health: [
      'http://localhost:3400/health',
      'http://127.0.0.1:3400/health',
    ],
    envFile: BACKEND_ENV,
    required: true,
  },
  {
    name: 'chroma',
    kind: 'venv',
    entry: 'node_modules/.bin/chroma', // 占位，实际按平台解析 .venv-chroma
    args: ['run', '--path', '.chroma-data', '--host', '127.0.0.1', '--port', '8000'],
    health: [
      'http://localhost:8000/api/v2/heartbeat',
      'http://127.0.0.1:8000/api/v2/heartbeat',
    ],
    // 与 scripts/chroma.mjs 共用 PID 文件，避免两套管理互相误判「已在运行」
    pidFile: join(ROOT, '.chroma-data', 'chroma.pid'),
    required: false,
  },
  {
    // scene 后端必须 --env-file 显式注入 backend/.env —— 后台进程 cwd 不保证为
    // backend，dotenv.config() 默认读 cwd/.env 会读错（曾因此 503）。
    name: 'scene',
    entry: 'backend/src/server.js',
    health: [
      'http://localhost:3000/api/scenes',
      'http://127.0.0.1:3000/api/scenes',
    ],
    envFile: BACKEND_ENV,
    required: true,
  },
  {
    name: 'shell-frontend',
    entry: VITE_BIN,
    args: ['--host', '0.0.0.0'],
    cwd: 'frontend',
    health: [
      'http://localhost:5173/',
      'http://127.0.0.1:5173/',
    ],
    required: true,
  },
  {
    name: 'world-3d',
    entry: VITE_BIN,
    args: ['--host', '0.0.0.0'],
    cwd: 'frontend/src/virtual-utopia',
    health: [
      'http://localhost:5175/',
      'http://127.0.0.1:5175/',
    ],
    required: true,
  },
  {
    name: 'admin-frontend',
    entry: VITE_BIN,
    args: ['--host', '0.0.0.0'],
    cwd: 'frontend/src/phase6',
    health: [
      'http://localhost:5174/',
      'http://127.0.0.1:5174/',
    ],
    required: true,
  },
];

const pidFile = (svc) => svc.pidFile || join(RUN_DIR, `${svc.name}.pid`);

const writePid = (svc, pid) => {
  mkdirSync(dirname(pidFile(svc)), { recursive: true });
  writeFileSync(pidFile(svc), String(pid));
};

const readPid = (svc) => {
  try {
    return Number.parseInt(readFileSync(pidFile(svc), 'utf8').trim(), 10);
  } catch {
    return 0;
  }
};

const pidAlive = (pid) => {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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

const stopByName = async (svc) => {
  const pid = readPid(svc);

  if (!pidAlive(pid)) {
    console.log(`[start-all] ${svc.name} 未在运行（PID ${pid || '-'}）`);
    rmSync(pidFile(svc), { force: true });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[start-all] ${svc.name} 已发送停止信号（PID ${pid}）`);
  } catch (error) {
    console.warn(`[start-all] ${svc.name} 停止失败: ${error.message}`);
  }
  rmSync(pidFile(svc), { force: true });
};

const statusAll = () => {
  for (const svc of SERVICES) {
    const pid = readPid(svc);
    const alive = pidAlive(pid);
    console.log(`[start-all] ${alive ? '●' : '○'} ${svc.name} ${alive ? `(PID ${pid})` : '未运行'}`);
  }
};

const main = async () => {
  const command = process.argv[2];

  if (command === 'stop') {
    for (const svc of SERVICES) {
      await stopByName(svc);
    }
    console.log('[start-all] 全部服务已停止');
    return;
  }

  if (command === 'status') {
    statusAll();
    return;
  }

  mkdirSync(LOG_DIR, { recursive: true });

  for (const svc of SERVICES) {
    console.log('[start-all] 启动 ' + svc.name + ' ...');

    // 若旧 PID 仍存活，跳过启动（chroma 与 scripts/chroma.mjs 共用 PID 文件）。
    const oldPid = readPid(svc);
    if (pidAlive(oldPid)) {
      console.warn(`[start-all] ${svc.name} 已在运行（PID ${oldPid}），跳过启动`);
      continue;
    }

    const outPath = join(LOG_DIR, `${svc.name}.out.log`);
    const errPath = join(LOG_DIR, `${svc.name}.err.log`);
    const outFd = openSync(outPath, 'a');
    const errFd = openSync(errPath, 'a');

    const child =
      svc.kind === 'venv'
        ? spawn(
            venvChromaPath(),
            svc.args.map((a) =>
              a === '.chroma-data' ? join(ROOT, '.chroma-data') : a,
            ),
            {
              detached: true,
              stdio: ['ignore', outFd, errFd],
            },
          )
        : spawn(
            process.execPath,
            [
              ...(svc.envFile ? ['--env-file', resolve(ROOT, svc.envFile)] : []),
              resolve(ROOT, svc.entry),
              ...(svc.args || []),
            ],
            {
              cwd: svc.cwd ? resolve(ROOT, svc.cwd) : ROOT,
              env: { ...process.env, ...(svc.extraEnv || {}) },
              detached: true,
              stdio: ['ignore', outFd, errFd],
            },
          );

    writePid(svc, child.pid);
    // detached 子进程须 unref：否则父进程事件循环被子进程句柄持有，
    // 即使 main() 完成也不会退出（P5.1-④ 实测卡住）。
    child.unref();

    const ready = await waitForHealth(svc.health, HEALTH_TIMEOUT_MS);
    if (ready) {
      console.log(`[start-all] ${svc.name} 就绪（PID ${child.pid}）`);
    } else if (svc.required) {
      console.error(`[start-all] ${svc.name} 健康检查超时，终止`);
      await stopByName(svc);
      process.exitCode = 1;
      return;
    } else {
      console.warn(`[start-all] ${svc.name} 健康检查未通过（非必需，PID ${child.pid}）`);
    }
  }

  console.log('[start-all] 全部必需服务已就绪（detached，主进程退出后服务保持运行）');
  console.log('[start-all] 停止服务: node scripts/start-all.mjs stop');
};

main().catch((error) => {
  console.error('[start-all] 异常: ' + (error && error.message));
  process.exit(1);
});
