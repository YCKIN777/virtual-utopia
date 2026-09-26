#!/usr/bin/env node
// scripts/build-all.mjs
// P5.3-⑨：三入口生产构建 + preview 冒烟验证。
// 用法：
//   node scripts/build-all.mjs            # 三入口 vite build（产物落各入口 dist/）
//   node scripts/build-all.mjs preview    # 起 preview 冒烟（默认端口 4173/5176/5177），验证后自动停
//   node scripts/build-all.mjs all        # build + preview 验证
import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

// 三入口：名称 / 构建工作目录 / preview 端口
const ENTRIES = [
  { name: '外层壳 shell', cwd: 'frontend', previewPort: 4173, healthPath: '/' },
  { name: '3D 世界', cwd: 'frontend/src/virtual-utopia', previewPort: 5176, healthPath: '/' },
  { name: '管理后台', cwd: 'frontend/src/phase6', previewPort: 5177, healthPath: '/' },
];

const build = () => {
  let failed = false;

  for (const entry of ENTRIES) {
    const cwd = resolve(ROOT, entry.cwd);
    console.log(`\n[build-all] === ${entry.name} build ===`);

    const result = spawnSync(process.execPath, [VITE_BIN, 'build'], {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
    });

    const tail = (result.stdout || '').split('\n').filter(Boolean).slice(-5);
    console.log(tail.join('\n'));

    if (result.status !== 0) {
      console.error(`[build-all] ${entry.name} 构建失败`);
      console.error((result.stderr || '').slice(-1000));
      failed = true;
    } else {
      const distDir = join(cwd, 'dist');
      console.log(
        `[build-all] ${entry.name} dist 产物：${existsSync(distDir) ? '存在' : '缺失'}（${distDir}）`,
      );
    }
  }

  return !failed;
};

const preview = async () => {
  const servers = [];

  const waitReady = (url, timeoutMs = 15000) =>
    new Promise((resolveReady) => {
      const deadline = Date.now() + timeoutMs;
      const poll = () => {
        if (Date.now() > deadline) return resolveReady(false);
        fetch(url, { signal: AbortSignal.timeout(2000) })
          .then((res) => resolveReady(res.ok))
          .catch(() => setTimeout(poll, 300));
      };
      poll();
    });

  for (const entry of ENTRIES) {
    const cwd = resolve(ROOT, entry.cwd);
    const child = spawn(
      process.execPath,
      [VITE_BIN, 'preview', '--host', '0.0.0.0', '--port', String(entry.previewPort)],
      {
        cwd,
        detached: false,
        stdio: 'ignore',
      },
    );
    servers.push(child);

    const url = `http://localhost:${entry.previewPort}${entry.healthPath}`;
    const ok = await waitReady(url);
    console.log(`[build-all] preview ${entry.name} ${url} -> ${ok ? '200 OK' : 'FAIL'}`);
    if (!ok) return false;
  }

  // 验证后停止 preview 服务
  for (const child of servers) {
    try {
      child.kill('SIGTERM');
    } catch {
      // 忽略停止失败
    }
  }

  return true;
};

const main = async () => {
  const command = process.argv[2] || 'build';

  if (command === 'preview') {
    process.exit((await preview()) ? 0 : 1);
  }

  const buildOk = build();
  if (!buildOk) {
    console.error('[build-all] 构建未通过');
    process.exit(1);
  }

  if (command === 'all') {
    const previewOk = await preview();
    process.exit(previewOk ? 0 : 1);
  }

  console.log('\n[build-all] 构建完成；预览验证：node scripts/build-all.mjs preview');
};

main().catch((error) => {
  console.error('[build-all] 异常: ' + (error && error.message));
  process.exit(1);
});
