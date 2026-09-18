import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openM5Database } from '../src/database.js';
import { createLayoutService } from '../src/layoutService.js';
import { createOwnershipResolver } from '../src/ownershipResolver.js';
import { createM5RealtimeHub } from '../src/realtimeHub.js';
import { createM5Repositories } from '../src/repositories.js';

const owner = {
  id: 1,
  username: 'owner',
  role: 'editor',
};

const visitor = {
  id: 2,
  username: 'visitor',
  role: 'editor',
};

const viewer = {
  id: 3,
  username: 'viewer',
  role: 'viewer',
};

test('home layout persists and enforces plot ownership', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m5-'));
  const bp3Path = path.join(directory, 'bp3.sqlite');
  const bp3 = new DatabaseSync(bp3Path);

  bp3.exec(`
    CREATE TABLE bp3_plot_owners (
      plot_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
    );
    INSERT INTO bp3_plot_owners VALUES ('plot-1', 1);
    INSERT INTO bp3_plot_owners VALUES ('plot-2', 3);
  `);
  bp3.close();

  const database = await openM5Database({
    databasePath: path.join(directory, 'm5.sqlite'),
  });
  const repositories = createM5Repositories(database);
  const ownershipResolver = createOwnershipResolver({
    bp3DatabasePath: bp3Path,
  });
  const realtimeHub = createM5RealtimeHub();
  const layoutService = createLayoutService({
    repositories,
    ownershipResolver,
    realtimeHub,
  });

  try {
    const saved = layoutService.saveLayout({
      user: owner,
      plotId: 'plot-1',
      items: [
        {
          id: 'chair-1',
          materialId: 'chair',
          x: 1,
          y: 2,
          rotation: 90,
        },
      ],
    });

    assert.equal(saved.layout.version, 1);
    assert.equal(saved.layout.items.length, 1);
    assert.equal(saved.event.sequence, 1);
    assert.equal(
      layoutService.getLayout(owner, 'plot-1').items[0].materialId,
      'chair',
    );
    assert.throws(
      () =>
        layoutService.saveLayout({
          user: visitor,
          plotId: 'plot-1',
          items: [],
        }),
      {
        code: 'BP4_FORBIDDEN',
      },
    );
    assert.throws(
      () =>
        layoutService.saveLayout({
          user: viewer,
          plotId: 'plot-2',
          items: [],
        }),
      {
        code: 'BP4_FORBIDDEN',
      },
    );
    assert.equal(layoutService.listEvents('plot-1').length, 1);
  } finally {
    ownershipResolver.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('M5 realtime hub publishes layout events and resumes history', () => {
  const hub = createM5RealtimeHub();
  const connection = hub.register({
    user: { id: 1, username: 'owner' },
    channelIds: ['world-main'],
  });
  const event = hub.publish({
    channelId: 'world-main',
    type: 'home.layout.updated',
    data: { plotId: 'plot-1', version: 1 },
  });

  assert.equal(event.sequence, 1);
  assert.equal(hub.resume(connection.connectionId, 'world-main', 0).length, 1);
});
