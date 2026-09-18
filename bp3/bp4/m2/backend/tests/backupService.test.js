import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBackupService } from '../src/backupService.js';

test('backup service creates and restores PostgreSQL commands', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m2-backup-'));
  const commands = [];
  const service = createBackupService({
    config: {
      backupDirectory: directory,
      databaseUrl: 'postgresql://user:pass@localhost:5432/utopia',
    },
    clock: () => new Date('2026-09-17T12:00:00.000Z'),
    execImpl(file, args, callback) {
      commands.push({ file, args });
      callback(null, '', '');
    },
    logger: {
      info() {},
    },
  });

  try {
    const created = await service.create();
    await writeFile(created.filePath, 'backup-data');
    const verified = await service.verify({
      filePath: created.filePath,
    });
    const restored = await service.restore({
      filePath: created.filePath,
    });

    assert.match(created.filePath, /virtual-utopia-.*\.dump$/);
    assert.equal(commands[0].file, 'pg_dump');
    assert.ok(commands[0].args.includes('--format=custom'));
    assert.equal(verified.valid, true);
    assert.equal(restored.status, 'restored');
    assert.ok(
      commands.some(
        (command) =>
          command.file === 'pg_restore' && command.args.includes('--clean'),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
