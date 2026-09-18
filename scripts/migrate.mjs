#!/usr/bin/env node
/**
 * 数据库迁移版本管理脚本（独立于冻结代码，新增 schema_migrations 表 + 版本化 SQL）。
 *
 * 用法：
 *   node scripts/migrate.mjs <db路径> [--dir=<迁移目录>]
 *
 * 说明：
 *   - 迁移文件命名：<序号>_<描述>.sql（如 0001_ops_meta.sql）。
 *   - 首次运行自动创建 schema_migrations 表记录已应用版本。
 *   - 每个迁移在事务中执行，失败自动回滚。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const dbArg = args.find((a) => !a.startsWith('--'));
const dirArg = args.find((a) => a.startsWith('--dir='));

if (!dbArg) {
  console.error('用法: node scripts/migrate.mjs <db路径> [--dir=<迁移目录>]');
  process.exit(2);
}

const dbPath = resolve(dbArg);
const dir = dirArg
  ? resolve(dirArg.slice('--dir='.length))
  : resolve('migrations');

if (!existsSync(dir)) {
  console.error('[migrate] 迁移目录不存在: ' + dir);
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec(
  'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
);

const applied = new Set(
  db
    .prepare('SELECT version FROM schema_migrations')
    .all()
    .map((row) => row.version),
);

const files = readdirSync(dir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

let count = 0;
for (const file of files) {
  const version = file.split('_')[0];
  if (applied.has(version)) continue;

  const sql = readFileSync(join(dir, file), 'utf8');
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(version, file, new Date().toISOString());
    db.exec('COMMIT');
    console.log('[migrate] 已应用: ' + file);
    count += 1;
  } catch (error) {
    db.exec('ROLLBACK');
    console.error(
      '[migrate] 失败: ' + file + ' - ' + (error && error.message),
    );
    db.close();
    process.exit(1);
  }
}

console.log('[migrate] 完成，本次应用 ' + count + ' 个迁移');
db.close();
