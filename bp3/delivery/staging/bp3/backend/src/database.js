import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.sql',
);

export const openBp3Database = async ({
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

export const createDatabaseClient = (database) => {
  const transaction = (callback) => {
    database.exec('BEGIN IMMEDIATE');

    try {
      const result = callback();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    database,
    transaction,
    close() {
      database.close();
    },
  };
};
