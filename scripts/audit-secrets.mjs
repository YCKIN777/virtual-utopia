import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const KEY_NAMES = [
  'DEEPSEEK_API_KEY',
  'PHASE5_AUTH_SECRET',
  'PHASE5_SERVICE_TOKEN',
  'PHASE5_BOOTSTRAP_ADMIN_PASSWORD',
  'JWT_SECRET',
  'API_KEY',
  'SECRET',
];

const results = [];

function walk(dir, depth) {
  if (depth > 4) return;
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.git'))
      continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, depth + 1);
      continue;
    }
    const isEnv =
      name === '.env' ||
      name.startsWith('.env.') ||
      name === 'key.txt' ||
      name.endsWith('.key');
    if (!isEnv) continue;
    const content = readFileSync(abs, 'utf8');
    const hits = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().startsWith('#') || line.trim() === '') continue;
      const eq = line.indexOf('=');
      if (eq < 0) {
        if (name === 'key.txt') {
          const bare = line.trim();
          const isPlaceholder =
            !bare ||
            /(changeme|change[-_]?me|replace|example|sample|demo|placeholder|your[-_]?|local|<.*>)/i.test(
              bare,
            );
          hits.push({ key: '(裸值)', hasValue: !isPlaceholder });
        }
        continue;
      }
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (KEY_NAMES.some((k) => key.toUpperCase().includes(k))) {
        const isPlaceholder =
          !val ||
          /(changeme|change[-_]?me|replace|example|sample|demo|placeholder|your[-_]?|local|<.*>)/i.test(
            val,
          );
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
console.log(
  risk > 0
    ? '[warn] 发现 ' + risk + ' 个含真实值的敏感项，需清理'
    : '[ok] 未发现含真实值的敏感项',
);
process.exitCode = risk > 0 ? 1 : 0;
