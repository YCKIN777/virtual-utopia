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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 500;

const SERVICES = [
  {
    name: 'phase5',
    entry: 'backend/src/phase5/server.js',
    health: 'http://127.0.0.1:3300/api/phase5/health',
    required: true,
  },
  {
    name: 'phase6',
    entry: 'backend/src/phase6/server.js',
    health: 'http://127.0.0.1:3400/health',
    required: true,
  },
];

const children = [];

const waitForHealth = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // 未就绪，继续等待
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  return false;
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
    const child = spawn(process.execPath, [resolve(ROOT, svc.entry)], {
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
