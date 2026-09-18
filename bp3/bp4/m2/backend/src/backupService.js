import { mkdir, stat } from 'node:fs/promises';
import { execFile as defaultExecFile } from 'node:child_process';
import path from 'node:path';

const runCommand = (execImpl, file, args) =>
  new Promise((resolve, reject) => {
    execImpl(file, args, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });

export const createBackupService = ({
  config,
  execImpl = defaultExecFile,
  logger = console,
  clock = () => new Date(),
}) => {
  const ensureDirectory = () =>
    mkdir(config.backupDirectory, { recursive: true });

  const createBackupPath = () => {
    const stamp = clock()
      .toISOString()
      .replaceAll(':', '-')
      .replace(/\.\d{3}Z$/, 'Z');

    return path.join(config.backupDirectory, `virtual-utopia-${stamp}.dump`);
  };

  const create = async ({ dryRun = false } = {}) => {
    await ensureDirectory();
    const filePath = createBackupPath();

    if (dryRun) {
      await runCommand(execImpl, process.execPath, [
        '-e',
        `require('fs').writeFileSync(${JSON.stringify(
          filePath,
        )}, 'bp4-m2-dry-run-backup')`,
      ]);

      return {
        status: 'dry-run',
        filePath,
      };
    }

    if (!config.databaseUrl) {
      throw new Error('BP4_DATABASE_URL is required for PostgreSQL backup');
    }

    await runCommand(execImpl, 'pg_dump', [
      '--format=custom',
      '--no-owner',
      '--file',
      filePath,
      config.databaseUrl,
    ]);
    logger.info?.('backup_created', { filePath });

    return {
      status: 'created',
      filePath,
    };
  };

  const verify = async ({ filePath }) => {
    const file = await stat(filePath);

    if (file.size <= 0) {
      throw new Error('Backup file is empty');
    }

    await runCommand(execImpl, 'pg_restore', ['--list', filePath]);

    return {
      filePath,
      size: file.size,
      valid: true,
    };
  };

  const restore = async ({ filePath }) => {
    if (!config.databaseUrl) {
      throw new Error('BP4_DATABASE_URL is required for PostgreSQL restore');
    }

    await verify({ filePath });
    await runCommand(execImpl, 'pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--dbname',
      config.databaseUrl,
      filePath,
    ]);
    logger.info?.('backup_restored', { filePath });

    return {
      status: 'restored',
      filePath,
    };
  };

  return Object.freeze({
    create,
    restore,
    verify,
  });
};
