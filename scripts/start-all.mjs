#!/usr/bin/env node
/**
 * 服务启动编排脚本：按依赖顺序拉起全部服务并做健康探测。
 *
 * 用法：
 *   node scripts/start-all.mjs
 *
 * 启动顺序：phase5(3300) -> phase6(3400) -> chroma(8000, 可选) -> scene(3000)
 *           -> 外层壳 frontend(5173) -> 3D 世界 virtual-utopia(5175)。
 *
 * 环境变量：
 *   PHASE5_AUTH_SECRET / PHASE5_BOOTSTRAP_ADMIN_PASSWORD 可覆盖 phase5 默认值
 *   （默认 changeme / utopia2026，与 backend/.env.example 一致，本地预览用）。
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
  {
    // 预览轮修复：scene 后端必须 --env-file 显式注入 backend/.env ——
    // 后台进程 cwd 不保证为 backend，dotenv.config() 默认读 cwd/.env 会读错
    // （曾因此出现 DEEPSEEK_CONFIGURATION_ERROR 503）。
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
    // 外层壳（Vue3 场景对话 UI）—— vite dev server
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
    // 3D 主世界（Three.js WorldView + GLB 宅院模型）—— 独立入口
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
        ? spawn(
            venvChromaPath(),
            svc.args.map((a) =>
              a === '.chroma-data' ? join(ROOT, '.chroma-data') : a,
            ),
            { stdio: 'inherit' },
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
              stdio: 'inherit',
            },
          );
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
