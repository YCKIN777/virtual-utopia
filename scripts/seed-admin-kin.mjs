#!/usr/bin/env node
/**
 * 预置 KIN 管理员账号（可重复执行，幂等）。
 *
 * 用途：在账号库（phase5 SQLite，与 traveler 同一持久化存储）中创建/修复
 *       角色为 admin 的管理员账号，使管理员可正常登录管理台。
 *
 * 用法：
 *   node scripts/seed-admin-kin.mjs                      # 未指定则自动生成强密码并打印
 *   node scripts/seed-admin-kin.mjs --password=xxxx      # 指定密码
 *   node scripts/seed-admin-kin.mjs --username=KIN --display-name=KIN
 *
 * 说明：登录链路为「前端 sha256(明文) → 后端 scrypt」，因此这里按
 *       hashPassword(sha256Hex(password)) 写入，与前端登录流程完全对齐。
 *       本脚本只写 users 表，不改动任何其他数据。
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { hashPassword, sha256Hex } from '../backend/src/phase5/security.js';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const readArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const generatePassword = () => {
  // 去掉易混淆字符（0/O、1/l/I），保证可手输
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (length) => {
    const bytes = randomBytes(length);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  };
  return `KIN-${pick(8)}-${pick(4)}`;
};

const username = readArg('username', 'KIN');
const displayName = readArg('display-name', 'KIN（城主 · 管理员）');
const role = readArg('role', 'admin');
const providedPassword = readArg('password', '');
const password = providedPassword || generatePassword();
const databasePath = path.resolve(
  process.env.PHASE5_DB_PATH ||
    path.join(rootDirectory, 'data', 'virtual_utopia_phase5.sqlite'),
);

if (!['admin', 'editor', 'viewer'].includes(role)) {
  console.error(`invalid --role=${role}（仅支持 admin / editor / viewer）`);
  process.exit(1);
}

const database = new DatabaseSync(databasePath);
const now = new Date().toISOString();
const passwordHash = await hashPassword(sha256Hex(password));

const existing = database
  .prepare('SELECT id, username, role, status FROM users WHERE username = ?')
  .get(username);

if (existing) {
  database
    .prepare(
      'UPDATE users SET password_hash = ?, role = ?, status = ?, display_name = ?, updated_at = ? WHERE id = ?',
    )
    .run(passwordHash, role, 'active', displayName, now, existing.id);
  console.log(
    JSON.stringify(
      {
        action: 'updated',
        id: existing.id,
        username,
        role,
        status: 'active',
        databasePath,
      },
      null,
      2,
    ),
  );
} else {
  const result = database
    .prepare(
      'INSERT INTO users (username, password_hash, role, status, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(username, passwordHash, 'admin', 'active', displayName, now, now);
  console.log(
    JSON.stringify(
      {
        action: 'created',
        id: Number(result.lastInsertRowid),
        username,
        role,
        status: 'active',
        databasePath,
      },
      null,
      2,
    ),
  );
}

const verify = database
  .prepare('SELECT id, username, role, status, display_name FROM users WHERE username = ?')
  .get(username);
console.log('stored:', JSON.stringify(verify));
console.log(
  providedPassword
    ? 'password: (沿用命令行指定值)'
    : `password: ${password}`,
);

database.close();
