import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openM3Database } from '../src/database.js';
import { createHomeService } from '../src/homeService.js';
import { createPlayerStatusService } from '../src/playerStatusService.js';
import { createRbacService } from '../src/rbacService.js';
import { createM3Repositories } from '../src/repositories.js';
import { createWorldService } from '../src/worldService.js';

const admin = {
  id: 1,
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
};

const editor = {
  id: 2,
  username: 'editor',
  displayName: 'Editor',
  role: 'editor',
};

const viewer = {
  id: 3,
  username: 'viewer',
  displayName: 'Viewer',
  role: 'viewer',
};

const createFixture = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m3-'));
  const database = await openM3Database({
    databasePath: path.join(directory, 'm3.sqlite'),
  });
  const repositories = createM3Repositories(database);
  const rbac = createRbacService({ repositories });

  return {
    database,
    directory,
    homeService: createHomeService({ repositories, rbac }),
    playerStatus: createPlayerStatusService(),
    rbac,
    repositories,
    worldService: createWorldService({ repositories, rbac }),
  };
};

test('RBAC allows operators to manage worlds but not accounts', async () => {
  const fixture = await createFixture();

  try {
    const world = fixture.worldService.create({
      user: editor,
      id: 'world-main',
      name: '主世界',
      region: 'cn-east',
      capacity: 100,
    });

    assert.equal(world.status, 'draft');
    assert.throws(() => fixture.rbac.listAccounts(editor), {
      code: 'BP4_FORBIDDEN',
    });
    assert.equal(fixture.rbac.effectiveRole(viewer), 'viewer');
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});

test('world and home management persists admin changes', async () => {
  const fixture = await createFixture();

  try {
    fixture.worldService.create({
      user: admin,
      id: 'world-main',
      name: '主世界',
      region: 'cn-east',
      capacity: 100,
    });
    const home = fixture.homeService.create({
      user: admin,
      plotId: 'plot-1',
      worldId: 'world-main',
      ownerUserId: 1,
      ownerUsername: 'admin',
      visitMode: 'public',
    });
    const updatedWorld = fixture.worldService.update({
      user: admin,
      worldId: 'world-main',
      fields: { status: 'online' },
    });
    const updatedHome = fixture.homeService.update({
      user: admin,
      plotId: home.plotId,
      fields: { status: 'maintenance' },
    });

    assert.equal(updatedWorld.status, 'online');
    assert.equal(updatedHome.status, 'maintenance');
    assert.equal(fixture.repositories.worlds.list().length, 1);
    assert.equal(fixture.repositories.homes.list().length, 1);
    assert.ok(fixture.repositories.audit.list().length >= 4);
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});

test('player status aggregates M1 realtime events', () => {
  const service = createPlayerStatusService();

  service.recordEvent({
    type: 'presence.updated',
    data: {
      users: [
        {
          userId: 7,
          username: 'traveler',
          displayName: '漫游者',
          role: 'editor',
        },
      ],
    },
  });
  service.recordEvent({
    type: 'avatar.state.updated',
    actorUserId: 7,
    data: {
      actionId: 'wave',
      emoteId: 'happy',
    },
  });
  service.recordEvent({
    type: 'voice.participant.updated',
    data: {
      userId: 7,
      muted: false,
      speaking: true,
    },
  });

  const players = service.list();

  assert.equal(players.length, 1);
  assert.equal(players[0].actionId, 'wave');
  assert.equal(players[0].speaking, true);
  assert.deepEqual(service.summary(), {
    total: 1,
    online: 1,
    speaking: 1,
    lastM1EventAt: service.summary().lastM1EventAt,
  });
});
