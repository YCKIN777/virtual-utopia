import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.module-a.sql',
);

export const openModuleADatabase = async ({
  databasePath,
  busyTimeoutMs = 5000,
}) => {
  await mkdir(path.dirname(databasePath), {
    recursive: true,
  });
  const database = new DatabaseSync(databasePath);
  const schema = await readFile(schemaPath, 'utf8');

  database.exec(schema);
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  return database;
};
