#!/usr/bin/env node
/**
 * 通用进程守护脚本：spawn 服务入口 + 崩溃自动重启 + 优雅关闭转发
 *
 * 用法：
 *   node scripts/supervise.mjs backend/src/phase5/server.js
 *   node scripts/supervise.mjs bp3/bp4/m1/backend/src/server.js
 *
 * 说明：
 *   - 子进程正常退出(0)或异常退出(非0/信号)时，延迟 RESTART_DELAY_MS 后自动重启。
 *   - 连续崩溃超过 MAX_RESTARTS 次则停止守护并退出，避免无限重启风暴。
 *   - 收到 SIGINT/SIGTERM 时转发给子进程，等待其优雅关闭后退出。
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const entry = process.argv[2];

if (!entry) {
  console.error('用法: node scripts/supervise.mjs <entry-file>');
  process.exit(2);
}

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 3000;
const SHUTDOWN_TIMEOUT_MS = 8000;

let child = null;
let restarts = 0;
let stopping = false;

const launch = () => {
  child = spawn(process.execPath, [resolve(entry)], { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (stopping) {
      process.exit(code === 0 ? 0 : 1);
      return;
    }
    restarts += 1;
    if (restarts > MAX_RESTARTS) {
      console.error(
        '[supervise] 连续崩溃超过 ' + MAX_RESTARTS + ' 次，停止守护',
      );
      process.exit(1);
      return;
    }
    console.log(
      '[supervise] 进程退出 code=' +
        code +
        ' signal=' +
        signal +
        '，' +
        RESTART_DELAY_MS +
        'ms 后重启（第 ' +
        restarts +
        ' 次）',
    );
    setTimeout(launch, RESTART_DELAY_MS);
  });

  child.on('error', (error) => {
    console.error('[supervise] 启动失败: ' + error.message);
    if (stopping) {
      process.exit(1);
      return;
    }
    restarts += 1;
    if (restarts > MAX_RESTARTS) {
      process.exit(1);
      return;
    }
    setTimeout(launch, RESTART_DELAY_MS);
  });
};

const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  console.log('[supervise] 收到 ' + signal + '，转发给子进程并等待优雅关闭');
  const killSignal = signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
  if (child && !child.killed) {
    child.once('exit', (code) => {
      process.exit(code === 0 ? 0 : 1);
    });
    child.kill(killSignal);
  } else {
    process.exit(0);
  }
  setTimeout(() => {
    console.error(
      '[supervise] 子进程未在 ' + SHUTDOWN_TIMEOUT_MS + 'ms 内退出，强制结束',
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

launch();
