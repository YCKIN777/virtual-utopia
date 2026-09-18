import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openP1Database } from '../../../p1/backend/src/database.js';

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema.p2.sql',
);

export const openP2Database = async ({
  databasePath,
  busyTimeoutMs = 5000,
}) => {
  const databaseClient = await openP1Database({
    databasePath,
    busyTimeoutMs,
  });
  const schema = await readFile(schemaPath, 'utf8');

  databaseClient.database.exec(schema);
  databaseClient.database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  return databaseClient;
};
