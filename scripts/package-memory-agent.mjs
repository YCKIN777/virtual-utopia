#!/usr/bin/env node
/**
 * 分层记忆 Agent 交付打包脚本：
 *   1. 复制源码/SQL/文档/配置到 staging 目录
 *   2. 生成 manifest.json（文件清单 + SHA256）
 *   3. 生成 checksums.sha256
 *
 * 用法：node scripts/package-memory-agent.mjs
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = 'v1.0.0';
const STAGE = join(ROOT, 'deliverables', 'memory-agent-' + VERSION);

const SOURCES = [
  'backend/src/memory',
  'backend/src/runtime',
  'frontend/src/session',
  'docs/memory-agent',
  'docs/memory-architecture.md',
  'scripts/test-memory.mjs',
  'scripts/test-memory-e2e.mjs',
  'scripts/supervise.mjs',
  'scripts/check-env.mjs',
  'scripts/check-frozen.mjs',
  'scripts/audit-secrets.mjs',
  'scripts/backup-data.mjs',
  'scripts/alert.mjs',
  'scripts/migrate.mjs',
  'scripts/test-all.mjs',
  'Dockerfile',
  'frontend/Dockerfile',
  'docker-compose.yml',
];

const sha256 = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

const exclude = (p) => {
  const name = p.replace(/\\/g, '/');
  return (
    name.includes('node_modules') ||
    name.includes('.git/') ||
    name.includes('/dist') ||
    name.includes('__pycache__')
  );
};

// 重建 staging
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

let copied = 0;
for (const srcRel of SOURCES) {
  const abs = join(ROOT, srcRel);
  if (!existsSync(abs)) {
    console.log('[skip] ' + srcRel);
    continue;
  }
  const dest = join(STAGE, srcRel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(abs, dest, { recursive: true, filter: (p) => !exclude(p) });
  console.log('[copy] ' + srcRel);
  copied += 1;
}

// 收集文件并生成 manifest + checksums
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs);
    } else {
      files.push(abs);
    }
  }
};
walk(STAGE);

const entries = files
  .map((file) => {
    const rel = relative(STAGE, file).replace(/\\/g, '/');
    if (rel === 'manifest.json' || rel === 'checksums.sha256') return null;
    return { path: rel, sha256: sha256(file) };
  })
  .filter(Boolean)
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  name: 'virtual-utopia-memory-agent',
  version: VERSION,
  createdAt: new Date().toISOString(),
  fileCount: entries.length,
  files: entries,
};

writeFileSync(join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(STAGE, 'checksums.sha256'),
  entries.map((e) => e.sha256 + '  ' + e.path).join('\n') + '\n',
);

console.log('');
console.log('[package] 完成：' + STAGE);
console.log('[package] 复制条目：' + copied + '，文件数：' + entries.length);
