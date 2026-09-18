#!/usr/bin/env node
/**
 * BP2 一键风险整改脚本（只生成新文件与辅助脚本，不修改任何阶段源码）
 *
 * 用法：node scripts/remediate-risk.mjs
 *
 * 产物：
 *   .gitignore（合并缺失条目）
 *   .editorconfig
 *   .prettierrc.json / .prettierignore
 *   eslint.config.js
 *   scripts/backup-data.mjs
 *   scripts/check-structure.mjs
 *   scripts/audit-secrets.mjs
 *
 * 所有写入幂等：已存在文件跳过并提示；.gitignore 采用追加缺失行模式。
 */
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --check 校验模式：只校验已修改/生成的产物，不生成新文件
if (process.argv.includes('--check')) {
  const SERVER_FILES = [
    'backend/src/phase5/server.js',
    'backend/src/phase6/server.js',
    'bp3/backend/src/server.js',
    'bp3/bp4/m1/backend/src/server.js',
    'bp3/bp4/m2/backend/src/server.js',
    'bp3/bp4/m3/backend/src/server.js',
    'bp3/bp4/m4/backend/src/server.js',
    'bp3/bp4/m5/backend/src/server.js',
    'bp3/bp4/module-a/backend/src/server.js',
    'bp3/bp4/module-b/backend/src/server.js',
    'bp3/p1/backend/src/server.js',
    'bp3/p2/backend/src/server.js',
  ];
  const GEN_FILES = [
    'scripts/remediate-risk.mjs',
    'scripts/supervise.mjs',
    'scripts/backup-data.mjs',
    'scripts/check-structure.mjs',
    'scripts/audit-secrets.mjs',
  ];
  let failed = 0;
  const all = [...SERVER_FILES, ...GEN_FILES];
  for (const rel of all) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      console.log('[skip] 不存在: ' + rel);
      continue;
    }
    try {
      execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
      console.log('[ok] 语法: ' + rel);
    } catch (error) {
      failed++;
      console.log('[FAIL] 语法: ' + rel);
      const stderr = error.stderr
        ? error.stderr.toString()
        : String(error.message);
      console.log(stderr.split('\n').slice(0, 6).join('\n'));
    }
  }
  console.log('');
  console.log(
    failed === 0
      ? '[pass] 全部语法校验通过'
      : '[fail] 存在 ' + failed + ' 个语法错误',
  );
  process.exit(failed === 0 ? 0 : 1);
}

const written = [];
const skipped = [];
const appended = [];

function writeIfAbsent(relPath, content) {
  const abs = join(ROOT, relPath);
  if (existsSync(abs)) {
    skipped.push(relPath);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  written.push(relPath);
}

function appendMissingLines(relPath, lines) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, lines.join('\n') + '\n', 'utf8');
    written.push(relPath);
    return;
  }
  const existing = readFileSync(abs, 'utf8');
  const missing = lines.filter(
    (line) => !existing.split(/\r?\n/).includes(line),
  );
  if (missing.length === 0) {
    skipped.push(relPath);
    return;
  }
  writeFileSync(
    abs,
    existing.replace(/\s*$/, '') + '\n' + missing.join('\n') + '\n',
    'utf8',
  );
  appended.push(relPath);
}

// ---------------------------------------------------------------------------
// 1. .gitignore（合并缺失条目：密钥 / SQLite 数据 / 备份）
// ---------------------------------------------------------------------------
appendMissingLines('.gitignore', [
  'key.txt',
  '*.key',
  '*.sqlite',
  '*.sqlite-wal',
  '*.sqlite-shm',
  'backups/',
  'node_modules/',
  'dist/',
  '**/dist/',
]);

// ---------------------------------------------------------------------------
// 2. .editorconfig
// ---------------------------------------------------------------------------
writeIfAbsent(
  '.editorconfig',
  `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2
`,
);

// ---------------------------------------------------------------------------
// 3. Prettier
// ---------------------------------------------------------------------------
writeIfAbsent(
  '.prettierrc.json',
  JSON.stringify(
    {
      singleQuote: true,
      semi: true,
      trailingComma: 'all',
      printWidth: 80,
      tabWidth: 2,
      arrowParens: 'always',
    },
    null,
    2,
  ) + '\n',
);

writeIfAbsent(
  '.prettierignore',
  `node_modules
dist
**/dist
artifacts
*.sqlite
*.sqlite-wal
*.sqlite-shm
*.glb
*.png
*.webp
`,
);

// ---------------------------------------------------------------------------
// 4. ESLint flat config（ESM）
// ---------------------------------------------------------------------------
writeIfAbsent(
  'eslint.config.js',
  `import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'dist/**', '**/dist/**', 'artifacts/**'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
`,
);

// ---------------------------------------------------------------------------
// 5. scripts/backup-data.mjs（SQLite 一致快照备份 + SHA256 + 轮转）
// ---------------------------------------------------------------------------
writeIfAbsent(
  'scripts/backup-data.mjs',
  `import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIRS = [join(ROOT, 'data'), join(ROOT, 'bp3', 'data')];
const KEEP = 10; // 保留最近 N 份
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = join(ROOT, 'backups', stamp);

mkdirSync(backupRoot, { recursive: true });

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

const manifest = [];

for (const dir of DATA_DIRS) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.sqlite')) continue;
    const base = name;
    for (const suffix of ['', '-wal', '-shm']) {
      const src = join(dir, base + suffix);
      if (existsSync(src)) {
        copyFileSync(src, join(backupRoot, base + suffix));
      }
    }
    manifest.push({ file: join(dir, base), sha256: sha256(join(dir, base)) });
  }
}

writeFileSync(
  join(backupRoot, 'manifest.json'),
  JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 2),
);

// 轮转：只打印待清理目录，不自动删除（避免误删）
const backupsDir = join(ROOT, 'backups');
const dirs = readdirSync(backupsDir).filter((d) => !d.startsWith('.'));
if (dirs.length > KEEP) {
  const stale = dirs.sort().slice(0, dirs.length - KEEP);
  for (const d of stale) {
    console.log('[backup] 待清理旧备份: ' + join(backupsDir, d));
  }
}

console.log('[backup] 完成: ' + backupRoot);
console.log('[backup] 文件数: ' + manifest.length);
`,
);

// ---------------------------------------------------------------------------
// 6. scripts/check-structure.mjs（目录 / 冻结边界 / 端口清单校验）
// ---------------------------------------------------------------------------
writeIfAbsent(
  'scripts/check-structure.mjs',
  `import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_DIRS = [
  'frontend', 'backend', 'bp3', 'docs', 'database', 'data', 'scripts',
  'backend/src/agents', 'backend/src/routes', 'backend/src/services',
  'backend/src/rag', 'backend/src/phase4', 'backend/src/phase5', 'backend/src/phase6',
];

// 冻结目录：这些目录的源码不得被脚本自动修改
const FROZEN_DIRS = [
  'backend/src/agents', 'backend/src/routes', 'backend/src/services',
  'backend/src/rag', 'backend/src/phase4',
];

// 服务端口清单（文档基线）
const PORTS = {
  'BP2 后端': 3000, 'RAG': 3100, 'Phase4': 3200, 'Phase5': 3300,
  'Phase6': 3400, 'BP3 后端': 3500, '前端 5173': 5173, '世界前端': 5175, 'BP3 前端': 5176,
};

let failed = 0;

for (const d of REQUIRED_DIRS) {
  if (existsSync(join(ROOT, d))) {
    console.log('[ok] ' + d);
  } else {
    console.log('[MISSING] ' + d);
    failed++;
  }
}

console.log('');
console.log('[frozen] 冻结目录: ' + FROZEN_DIRS.join(', '));
console.log('[ports] ' + JSON.stringify(PORTS, null, 2));

console.log('');
console.log(failed === 0 ? '[pass] 结构校验通过' : '[fail] 存在 ' + failed + ' 个缺失目录');
process.exitCode = failed === 0 ? 0 : 1;
`,
);

// ---------------------------------------------------------------------------
// 7. scripts/audit-secrets.mjs（只读密钥扫描，只报路径与键名，不打印值）
// ---------------------------------------------------------------------------
writeIfAbsent(
  'scripts/audit-secrets.mjs',
  `import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const KEY_NAMES = [
  'DEEPSEEK_API_KEY', 'PHASE5_AUTH_SECRET', 'PHASE5_SERVICE_TOKEN',
  'PHASE5_BOOTSTRAP_ADMIN_PASSWORD', 'JWT_SECRET', 'API_KEY', 'SECRET',
];

const results = [];

function walk(dir, depth) {
  if (depth > 4) return;
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.git')) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, depth + 1);
      continue;
    }
    const isEnv = name === '.env' || name.startsWith('.env.') || name === 'key.txt' || name.endsWith('.key');
    if (!isEnv) continue;
    const content = readFileSync(abs, 'utf8');
    const hits = [];
    for (const line of content.split(/\\r?\\n/)) {
      if (line.trim().startsWith('#') || line.trim() === '') continue;
      const eq = line.indexOf('=');
      if (eq < 0) {
        if (name === 'key.txt') {
          const bare = line.trim();
          const isPlaceholder = !bare || /(changeme|change[-_]?me|replace|example|sample|demo|placeholder|your[-_]?|local|<.*>)/i.test(bare);
          hits.push({ key: '(裸值)', hasValue: !isPlaceholder });
        }
        continue;
      }
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (KEY_NAMES.some((k) => key.toUpperCase().includes(k))) {
        const isPlaceholder = !val || /(changeme|change[-_]?me|replace|example|sample|demo|placeholder|your[-_]?|local|<.*>)/i.test(val);
        hits.push({ key, hasValue: !isPlaceholder });
      }
    }
    if (hits.length > 0) {
      results.push({ file: abs.replace(ROOT, ''), hits });
    }
  }
}

walk(ROOT, 0);

console.log('=== 密钥扫描报告（不打印值）===');
let risk = 0;
for (const r of results) {
  for (const h of r.hits) {
    const flag = h.hasValue ? '[有值!]' : '[占位符]';
    console.log(flag + ' ' + r.file + '  ->  ' + h.key);
    if (h.hasValue) risk++;
  }
}
console.log('');
console.log(risk > 0 ? '[warn] 发现 ' + risk + ' 个含真实值的敏感项，需清理' : '[ok] 未发现含真实值的敏感项');
process.exitCode = risk > 0 ? 1 : 0;
`,
);

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log('=== BP2 风险整改脚本执行完成 ===');
console.log('新建文件:');
for (const f of written) console.log('  [new] ' + f);
console.log('追加条目:');
for (const f of appended) console.log('  [append] ' + f);
console.log('跳过(已存在):');
for (const f of skipped) console.log('  [skip] ' + f);

console.log('');
console.log('下一步（需人工确认后执行，本脚本不会自动做）：');
console.log('  1. 轮换 DeepSeek 密钥，并将 .env / key.txt 中真实值改为占位符');
console.log('  2. node scripts/audit-secrets.mjs  -> 确认无含真实值的敏感项');
console.log('  3. node scripts/backup-data.mjs    -> 生成首份 SQLite 备份');
console.log('  4. node scripts/check-structure.mjs -> 校验目录与冻结边界');
console.log('  5. 安装 eslint/prettier 依赖后跑 npm run lint');
