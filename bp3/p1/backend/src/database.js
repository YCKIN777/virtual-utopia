import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabaseClient,
  openBp3Database,
} from '../../../backend/src/database.js';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.p1.sql',
);

export const openP1Database = async ({
  databasePath,
  busyTimeoutMs = 5000,
}) => {
  const database = await openBp3Database({
    databasePath,
    busyTimeoutMs,
  });
  const schema = await readFile(schemaPath, 'utf8');

  database.exec(schema);
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  return createDatabaseClient(database);
};
