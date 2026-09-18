import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startM1Server } from '../backend/src/server.js';
import { readM1Config } from '../backend/src/config.js';
import { createMigrationService } from '../backend/src/migration/migrate.js';
import { createSqliteSource } from '../backend/src/migration/sqliteSource.js';

const createMemoryTarget = () => {
  const tables = new Map();

  return {
    async begin() {},
    async clearTable(tableName) {
      tables.set(tableName, []);
    },
    async commit() {},
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
      tables.clear();
    },
  };
};

const waitForMessage = (socket, predicate, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for realtime message'));
    }, timeoutMs);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };

    socket.on('message', onMessage);
  });

let server;

try {
  const config = {
    ...readM1Config(),
    host: '127.0.0.1',
    port: 0,
    ticketSecret: 'bp4-m1-e2e-secret',
  };
  server = await startM1Server({
    config,
    authAdapter: {
      authenticate: async (authorization) => {
        assert.equal(authorization, 'Bearer bp4-m1-e2e-user');

        return {
          id: 7,
          username: 'traveler',
          role: 'editor',
        };
      },
    },
  });
  const baseUrl = `http://127.0.0.1:${server.realtime.server.address().port}`;
  const ticketResponse = await fetch(`${baseUrl}/api/bp4/realtime/ticket`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer bp4-m1-e2e-user',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channelIds: ['world-main'],
    }),
  });

  assert.equal(ticketResponse.status, 200);
  const ticketPayload = await ticketResponse.json();
  const socket = new WebSocket(
    `ws://127.0.0.1:${server.realtime.server.address().port}/ws/bp4/realtime?ticket=${encodeURIComponent(
      ticketPayload.ticket,
    )}`,
  );
  const ready = await waitForMessage(
    socket,
    (message) => message.type === 'ready',
  );

  assert.equal(ready.user.id, 7);
  socket.send(
    JSON.stringify({
      type: 'subscribe',
      channelId: 'world-main',
    }),
  );
  await waitForMessage(
    socket,
    (message) =>
      message.type === 'subscribed' && message.channelId === 'world-main',
  );
  const eventPromise = waitForMessage(
    socket,
    (message) => message.type === 'avatar.state.updated',
  );
  const event = server.realtime.hub.publish({
    channelId: 'world-main',
    type: 'avatar.state.updated',
    actorUserId: 7,
    data: { actionId: 'wave' },
  });
  const delivered = await eventPromise;

  assert.equal(delivered.id, event.id);
  assert.equal(delivered.sequence, 1);
  socket.send(
    JSON.stringify({
      type: 'resume',
      channelId: 'world-main',
      afterSequence: 0,
    }),
  );
  const resumed = await waitForMessage(
    socket,
    (message) => message.type === 'resume.completed',
  );

  assert.equal(resumed.events.length, 1);
  assert.equal(resumed.events[0].id, event.id);
  socket.close();

  const migrationSource = createSqliteSource({
    databasePath: config.sqlitePath,
  });
  const migrationTarget = createMemoryTarget();
  const migration = createMigrationService({
    source: migrationSource,
    target: migrationTarget,
    batchSize: 100,
  });
  let migrationResult;
  let migrationValidation;

  try {
    migrationResult = await migration.run();
    migrationValidation = await migration.validate();
  } finally {
    migrationSource.close();
  }

  assert.equal(migrationResult.status, 'completed');
  assert.equal(migrationValidation.valid, true);

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        ticketIssued: true,
        websocketConnected: true,
        subscription: 'world-main',
        deliveredEvent: event.id,
        resumedEvents: resumed.events.length,
        migrationTables: migrationResult.tables.filter(
          (table) => !table.skipped,
        ).length,
        migratedRows: migrationResult.tables.reduce(
          (total, table) => total + table.targetCount,
          0,
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await server?.close().catch(() => null);
}
