import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
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
  JSON.stringify(
    { createdAt: new Date().toISOString(), files: manifest },
    null,
    2,
  ),
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
