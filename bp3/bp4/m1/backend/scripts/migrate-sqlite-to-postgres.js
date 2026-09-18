import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readM1Config } from '../src/config.js';
import { createMigrationService } from '../src/migration/migrate.js';
import { createPostgresTarget } from '../src/migration/postgresTarget.js';
import { createSqliteSource } from '../src/migration/sqliteSource.js';

const runMigration = async () => {
  const config = readM1Config();

  if (!config.databaseUrl) {
    throw new Error('BP4_DATABASE_URL is required');
  }

  const source = createSqliteSource({
    databasePath: config.sqlitePath,
  });
  const target = createPostgresTarget({
    databaseUrl: config.databaseUrl,
  });
  const migration = createMigrationService({
    source,
    target,
    batchSize: config.batchSize,
  });

  try {
    const result = await migration.run();

    console.log(JSON.stringify(result, null, 2));
  } finally {
    source.close();
    await target.close();
  }
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  runMigration().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
