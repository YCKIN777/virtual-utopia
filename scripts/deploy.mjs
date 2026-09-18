#!/usr/bin/env node
/**
 * 部署自动化脚本：校验 + 构建 + 生成交付清单（含 SHA256 摘要）。
 * 不打包 node_modules / dist / .git / 密钥，仅输出可追溯的源码摘要清单。
 *
 * 用法：
 *   node scripts/deploy.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const run = (label, cmd, args) => {
  console.log('[deploy] ' + label + ' ...');
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
};

const dirHash = (p) => {
  if (!existsSync(p)) return null;
  const st = statSync(p);
  if (st.isFile()) {
    return createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
  }
  const hash = createHash('sha256');
  for (const name of readdirSync(p).sort()) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'backups') continue;
    hash.update(name);
    hash.update(dirHash(resolve(p, name)) || '');
  }
  return hash.digest('hex').slice(0, 16);
};

const main = () => {
  // 1. 校验（语法 + 规范）
  run('lint', 'npx', ['eslint', '.']);
  run('syntax-check', process.execPath, ['scripts/remediate-risk.mjs', '--check']);

  // 2. 构建前端
  run('build', 'npm', ['run', 'build']);

  // 3. 生成交付清单 + SHA256 摘要
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const entries = ['package.json', 'backend', 'frontend', 'bp3', 'docs', 'database', 'migrations', 'scripts'];
  const manifest = {
    createdAt: new Date().toISOString(),
    files: entries.map((e) => ({ path: e, sha256: dirHash(resolve(ROOT, e)) })),
  };

  const outDir = resolve(ROOT, 'deliverables');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = resolve(outDir, 'deploy-manifest-' + stamp + '.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('[deploy] 交付清单已生成: ' + manifestPath);
};

main();
