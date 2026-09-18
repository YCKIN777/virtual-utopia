import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './security.js';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.sql',
);
const now = () => new Date().toISOString();

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
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  const userCount = database
    .prepare('SELECT COUNT(*) AS count FROM users')
    .get().count;

  if (userCount === 0 && bootstrapAdminPassword) {
    const timestamp = now();
    const passwordHash = await hashPassword(bootstrapAdminPassword);

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
