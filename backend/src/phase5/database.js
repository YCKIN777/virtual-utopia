import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, sha256Hex, verifyPassword } from './security.js';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.sql',
);
const now = () => new Date().toISOString();

/**
 * 将既有 users 表的 status CHECK 约束扩展到
 * ('active', 'disabled', 'pending', 'moved_out')。
 *
 * SQLite 无法直接修改 CHECK 约束，需要重建表。
 * 注意：不能用 `ALTER TABLE users RENAME TO ...`（会顺带改写其他表对
 * users 的外键引用，导致外键指向已删除的临时表）。这里采用
 * 「新建临时表 → 拷贝 → 删旧表 → 重命名临时表」的顺序，外键始终指向 users。
 * 仅当旧表 SQL 尚未包含 'pending' 时执行一次迁移。
 */
const migrateUserStatuses = (database) => {
  const row = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    )
    .get();

  if (!row?.sql || row.sql.includes("'pending'")) {
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled', 'pending', 'moved_out')),
      display_name TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO users_new (
      id, username, password_hash, role, status, display_name,
      last_login_at, created_at, updated_at
    )
    SELECT
      id, username, password_hash, role, status, display_name,
      last_login_at, created_at, updated_at
    FROM users;

    DROP TABLE users;

    ALTER TABLE users_new RENAME TO users;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
      ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role_status
      ON users(role, status);

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
};

/**
 * 修复历史迁移留下的损坏外键：
 * 早期迁移误用 `ALTER TABLE users RENAME TO users_migrating`，导致
 * chat_sessions / knowledge_documents / rag_logs 的外键指向不存在的
 * users_migrating。这里检测并重建这些表（外键改回 users）。
 */
const repairUserForeignKeys = (database) => {
  const broken = database
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%users_migrating%'",
    )
    .all();

  if (broken.length === 0) {
    return;
  }

  database.exec('PRAGMA foreign_keys = OFF;');
  database.exec('BEGIN;');

  for (const table of broken) {
    const temp = `${table.name}__recover`;
    const fixedSql = table.sql
      .replace(/users_migrating/g, 'users')
      .replace(/CREATE TABLE\s+"?([^"\s(]+)"?/, `CREATE TABLE "${temp}"`);

    database.exec(fixedSql);
    database.exec(
      `INSERT INTO "${temp}" SELECT * FROM "${table.name}";`,
    );
    database.exec(`DROP TABLE "${table.name}";`);
    database.exec(`ALTER TABLE "${temp}" RENAME TO "${table.name}";`);
  }

  database.exec('COMMIT;');
  database.exec('PRAGMA foreign_keys = ON;');
};

/**
 * 为既有 users 表补齐居民申请档案字段（爱好/职业/自我介绍/联系标识/家庭住址）。
 */
const migrateUserProfileFields = (database) => {
  const columns = database
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((column) => column.name);

  const additions = [
    ['hobbies', 'TEXT'],
    ['occupation', 'TEXT'],
    ['self_intro', 'TEXT'],
    ['contact', 'TEXT'],
    ['address', 'TEXT'],
    ['reject_reason', 'TEXT'],
  ];

  for (const [name, type] of additions) {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
    }
  }
};

/**
 * 管理员账号密码从旧「明文直存」方案迁移到「前端 SHA-256 + 后端 scrypt」方案。
 * 幂等：仅当管理员密码仍能按明文校验通过时执行一次重哈希。
 */
const migrateAdminPassword = async (
  database,
  { bootstrapAdminUsername, bootstrapAdminPassword },
) => {
  const admin = database
    .prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .get(bootstrapAdminUsername);

  if (!admin || !bootstrapAdminPassword) {
    return;
  }

  const matchesRaw = await verifyPassword(
    bootstrapAdminPassword,
    admin.password_hash,
  );

  if (matchesRaw) {
    const newHash = await hashPassword(sha256Hex(bootstrapAdminPassword));
    database
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(newHash, admin.id);
  }
};

export const openPhase5Database = async ({
  databasePath,
  busyTimeoutMs,
  bootstrapAdminUsername,
  bootstrapAdminPassword,
}) => {
  await mkdir(path.dirname(databasePath), {
    recursive: true,
  });

  const database = new DatabaseSync(databasePath);
  const schema = await readFile(schemaPath, 'utf8');

  database.exec(schema);
  migrateUserStatuses(database);
  repairUserForeignKeys(database);
  migrateUserProfileFields(database);
  await migrateAdminPassword(database, {
    bootstrapAdminUsername,
    bootstrapAdminPassword,
  });
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  const userCount = database
    .prepare('SELECT COUNT(*) AS count FROM users')
    .get().count;

  if (userCount === 0 && bootstrapAdminPassword) {
    const timestamp = now();
    const passwordHash = await hashPassword(sha256Hex(bootstrapAdminPassword));

    database
      .prepare(
        `INSERT INTO users (
          username,
          password_hash,
          role,
          status,
          display_name,
          created_at,
          updated_at
        ) VALUES (?, ?, 'admin', 'active', ?, ?, ?)`,
      )
      .run(
        bootstrapAdminUsername,
        passwordHash,
        'Phase5 Administrator',
        timestamp,
        timestamp,
      );
  }

  return database;
};

export const closePhase5Database = (database) => {
  database?.close();
};
