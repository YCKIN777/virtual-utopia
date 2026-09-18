import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { createHomeAccessService } from '../src/accessService.js';
import { openModuleADatabase } from '../src/database.js';
import { createModuleARepositories } from '../src/repositories.js';
import { createModuleARbacService } from '../src/rbacService.js';

const owner = {
  id: 1,
  username: 'owner',
  displayName: '房主',
  role: 'editor',
};
const friend = {
  id: 2,
  username: 'friend',
  displayName: '好友',
  role: 'editor',
};
const visitor = {
  id: 3,
  username: 'visitor',
  displayName: '访客',
  role: 'viewer',
};
const admin = {
  id: 4,
  username: 'admin',
  displayName: '管理员',
  role: 'admin',
};

const createFixture = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-module-a-'));
  const database = await openModuleADatabase({
    databasePath: path.join(directory, 'module-a.sqlite'),
  });
  const repositories = createModuleARepositories(database);
  const realtimeHub = createRealtimeHub();
  const rbac = createModuleARbacService();
  const service = createHomeAccessService({
    repositories,
    rbac,
    realtimeHub,
  });

  repositories.homes.ensure('plot-1');
  repositories.homes.ensure('plot-2');

  return {
    database,
    directory,
    realtimeHub,
    repositories,
    service,
  };
};

test('home ownership and three access modes enforce edit boundaries', async () => {
  const fixture = await createFixture();
  const connection = fixture.realtimeHub.registerConnection({
    user: admin,
    channelIds: ['world-main'],
  });

  try {
    fixture.service.updateOwner({
      user: admin,
      plotId: 'plot-1',
      ownerUserId: owner.id,
      ownerUsername: owner.username,
    });

    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: owner,
        plotId: 'plot-1',
        action: 'edit',
      }).allowed,
      true,
    );
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: visitor,
        plotId: 'plot-1',
        action: 'view',
      }).reason,
      'private',
    );
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: admin,
        plotId: 'plot-1',
        action: 'edit',
      }).allowed,
      false,
    );

    fixture.service.updateAccess({
      user: owner,
      plotId: 'plot-1',
      accessMode: 'friends',
      friendUserIds: [friend.id],
    });
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: friend,
        plotId: 'plot-1',
        action: 'view',
      }).allowed,
      true,
    );
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: friend,
        plotId: 'plot-1',
        action: 'edit',
      }).allowed,
      false,
    );

    fixture.service.updateAccess({
      user: admin,
      plotId: 'plot-1',
      accessMode: 'public',
      friendUserIds: [],
    });
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: visitor,
        plotId: 'plot-1',
        action: 'view',
      }).allowed,
      true,
    );
    assert.equal(
      fixture.service.evaluateCurrentUser({
        user: visitor,
        plotId: 'plot-1',
        action: 'edit',
      }).allowed,
      false,
    );
    assert.equal(
      fixture.realtimeHub.resume(connection.connectionId, 'world-main', 0)
        .length,
      3,
    );
    assert.deepEqual(fixture.service.summary(admin), {
      total: 2,
      unassigned: 1,
      private: 1,
      friends: 0,
      public: 1,
    });
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});

test('viewer cannot manage permissions and invalid modes are rejected', async () => {
  const fixture = await createFixture();

  try {
    assert.throws(
      () =>
        fixture.service.updateAccess({
          user: visitor,
          plotId: 'plot-1',
          accessMode: 'public',
          friendUserIds: [],
        }),
      {
        code: 'BP4_FORBIDDEN',
      },
    );
    assert.throws(
      () =>
        fixture.service.updateAccess({
          user: admin,
          plotId: 'plot-1',
          accessMode: 'invite-only',
          friendUserIds: [],
        }),
      {
        code: 'BP4_VALIDATION_ERROR',
      },
    );
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});
