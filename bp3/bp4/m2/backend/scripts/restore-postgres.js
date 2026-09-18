import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackupService } from '../src/backupService.js';
import { readM2Config } from '../src/config.js';

const filePath = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith('--'));

if (!filePath) {
  throw new Error(
    'Usage: node backend/scripts/restore-postgres.js <backup-file>',
  );
}

const run = async () => {
  const config = readM2Config();
  const backup = createBackupService({ config });
  const verifyOnly = process.argv.includes('--verify-only');

  console.log(
    JSON.stringify(
      verifyOnly
        ? await backup.verify({ filePath })
        : await backup.restore({ filePath }),
      null,
      2,
    ),
  );
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  run().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
