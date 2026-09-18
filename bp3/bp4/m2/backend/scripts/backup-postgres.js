import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackupService } from '../src/backupService.js';
import { readM2Config } from '../src/config.js';

const run = async () => {
  const config = readM2Config();
  const backup = createBackupService({ config });

  console.log(
    JSON.stringify(
      await backup.create({
        dryRun: process.argv.includes('--dry-run'),
      }),
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
