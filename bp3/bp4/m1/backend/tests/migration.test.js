import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createMigrationService } from '../src/migration/migrate.js';
import { createSqliteSource } from '../src/migration/sqliteSource.js';

const createMemoryTarget = () => {
  const tables = new Map();
  let snapshot = null;

  const target = {
    async begin() {
      snapshot = new Map(
        [...tables].map(([name, rows]) => [
          name,
          rows.map((row) => ({ ...row })),
        ]),
      );
    },
    async clearTable(tableName) {
      tables.set(tableName, []);
    },
    async commit() {
      snapshot = null;
    },
    async count(tableName) {
      return tables.get(tableName)?.length || 0;
    },
    async ensureTable({ tableName }) {
      if (!tables.has(tableName)) {
        tables.set(tableName, []);
      }
    },
    async insertRows({ tableName, columns, rows }) {
      const current = tables.get(tableName) || [];
      tables.set(
        tableName,
        current.concat(
          rows.map((row) =>
            Object.fromEntries(columns.map((column) => [column, row[column]])),
          ),
        ),
      );
    },
    async recordMigration() {},
    async rollback() {
      if (snapshot) {
        tables.clear();
        snapshot.forEach((rows, name) => tables.set(name, rows));
        snapshot = null;
      }
    },
    getTables() {
      return tables;
    },
  };

  return target;
};

test('SQLite migration copies required tables and validates counts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-migration-'));
  const databasePath = path.join(directory, 'source.sqlite');
  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE bp3_plot_owners (
      plot_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bp3_voice_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE bp3_voice_participants (
      channel_id TEXT NOT NULL,
      user_id INTEGER NOT NULL
    );
    CREATE TABLE bp3_home_access_rules (
      plot_id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      access_mode TEXT NOT NULL,
      lock_enabled INTEGER NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bp3_home_visitors (
      plot_id TEXT NOT NULL,
      user_id INTEGER NOT NULL
    );
    CREATE TABLE bp3_home_access_requests (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE bp3_home_access_grants (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE bp3_home_visit_logs (
      id INTEGER PRIMARY KEY
    );
    INSERT INTO bp3_plot_owners VALUES
      ('plot-1', 1, 'test', 'now', 'now');
    INSERT INTO bp3_voice_channels VALUES
      ('world-main', '世界语音');
    INSERT INTO bp3_voice_participants VALUES
      ('world-main', 1);
    INSERT INTO bp3_home_access_rules VALUES
      ('plot-1', 1, 'public', 0, 1, 'now', 'now');
  `);
  database.close();

  const source = createSqliteSource({ databasePath });
  const target = createMemoryTarget();
  const migration = createMigrationService({
    source,
    target,
    batchSize: 2,
  });

  try {
    const result = await migration.run();
    const validation = await migration.validate();

    assert.equal(result.status, 'completed');
    assert.equal(validation.valid, true);
    assert.equal(target.getTables().get('bp4_plot_owners').length, 1);
    assert.equal(target.getTables().get('bp4_voice_channels').length, 1);
  } finally {
    source.close();
    await rm(directory, { recursive: true, force: true });
  }
});
