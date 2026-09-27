/**
 * 记忆模块数据库连接层（独立于 phaseN 冻结代码）。
 * 负责打开独立 SQLite 数据库并应用 migrate-memory.sql 建表。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(moduleDir, 'migrate-memory.sql');

const defaultDbPath = () =>
  process.env.MEMORY_DB_PATH ||
  resolve(moduleDir, '..', '..', 'data', 'virtual_utopia_memory.sqlite');

export const openMemoryDatabase = ({ databasePath } = {}) => {
  const path = databasePath || defaultDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(schemaPath, 'utf8'));

  // 兼容旧库：user_memory 若无 embedding 列则补充（向量召回扩展，旧数据 embedding 为 NULL）
  const columns = db.prepare('PRAGMA table_info(user_memory)').all();
  if (!columns.some((column) => column.name === 'embedding')) {
    db.exec('ALTER TABLE user_memory ADD COLUMN embedding TEXT');
  }

  // 兼容旧库：conversations 若无 last_processed_message_id 列则补充（增量提炼游标）
  const convColumns = db.prepare('PRAGMA table_info(conversations)').all();
  if (!convColumns.some((column) => column.name === 'last_processed_message_id')) {
    db.exec('ALTER TABLE conversations ADD COLUMN last_processed_message_id TEXT');
  }

  return db;
};

export const newId = (prefix = 'id') =>
  prefix + '_' + randomUUID();

export const now = () => new Date().toISOString();
