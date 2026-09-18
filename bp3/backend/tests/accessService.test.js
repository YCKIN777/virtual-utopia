import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeAccessService } from '../src/accessService.js';
import { createAuthService } from '../src/auth.js';
import { createDatabaseClient, openBp3Database } from '../src/database.js';
import { createRepositories } from '../src/repositories.js';

const owner = {
  id: 101,
  username: 'owner',
  displayName: 'Owner',
  role: 'editor',
  authorization: 'Bearer owner-token',
};

const visitor = {
  id: 202,
  username: 'visitor',
  displayName: 'Visitor',
  role: 'viewer',
  authorization: 'Bearer visitor-token',
};

const admin = {
  id: 303,
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
  authorization: 'Bearer admin-token',
};

const createFixture = async () => {
  const database = await openBp3Database({
    databasePath: ':memory:',
  });
  const databaseClient = createDatabaseClient(database);
  const repositories = createRepositories(databaseClient);
  const authService = createAuthService({
    config: {
      phase5BaseUrl: 'http://phase5.invalid',
      requestTimeoutMs: 20,
      ownerResolutionEnabled: false,
    },
    repositories,
    fetchImpl: async () => {
      throw new Error('unexpected fetch');
    },
  });
  const accessService = createHomeAccessService({
    config: {
      inviteDefaultTtlSeconds: 3600,
    },
    repositories,
    authService,
  });

  return {
    accessService,
    databaseClient,
    repositories,
  };
};

test('owner controls private access and visitor approval', async () => {
  const fixture = await createFixture();

  try {
    await fixture.accessService.updateRule({
      plotId: 'plot-1',
      user: owner,
      accessMode: 'private',
      lockEnabled: true,
    });

    const denied = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'private');

    const request = await fixture.accessService.createRequest({
      plotId: 'plot-1',
      user: visitor,
      message: 'May I visit?',
    });
    assert.equal(request.status, 'pending');

    await fixture.accessService.resolveRequest({
      plotId: 'plot-1',
      user: owner,
      requestId: request.id,
      status: 'approved',
      expiresInSeconds: 3600,
    });

    const allowed = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.reason, 'grant');

    const consumed = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(consumed.allowed, false);
  } finally {
    fixture.databaseClient.close();
  }
});

test('whitelist, blacklist, temporary invite and revoke are enforced', async () => {
  const fixture = await createFixture();

  try {
    await fixture.accessService.updateRule({
      plotId: 'plot-1',
      user: owner,
      accessMode: 'whitelist',
      lockEnabled: true,
    });
    await fixture.accessService.setVisitor({
      plotId: 'plot-1',
      user: owner,
      userId: visitor.id,
      listType: 'whitelist',
    });

    const whitelisted = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(whitelisted.allowed, true);
    assert.equal(whitelisted.reason, 'whitelist');

    await fixture.accessService.setVisitor({
      plotId: 'plot-1',
      user: owner,
      userId: visitor.id,
      listType: 'blacklist',
    });
    const blocked = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'blacklisted');
    await assert.rejects(
      fixture.accessService.createRequest({
        plotId: 'plot-1',
        user: visitor,
      }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );

    await fixture.accessService.removeVisitor({
      plotId: 'plot-1',
      user: owner,
      userId: visitor.id,
    });
    const invite = await fixture.accessService.createInvite({
      plotId: 'plot-1',
      user: owner,
      expiresInSeconds: 3600,
      maxUses: 1,
    });
    const redeemed = await fixture.accessService.redeemInvite({
      token: invite.token,
      user: visitor,
    });
    assert.equal(redeemed.plotId, 'plot-1');

    const invitedAccess = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(invitedAccess.allowed, true);

    await fixture.accessService.setVisitor({
      plotId: 'plot-1',
      user: owner,
      userId: visitor.id,
      listType: 'whitelist',
    });
    await fixture.accessService.removeVisitor({
      plotId: 'plot-1',
      user: owner,
      userId: visitor.id,
    });
    const revoked = await fixture.accessService.checkAccess({
      plotId: 'plot-1',
      user: visitor,
    });
    assert.equal(revoked.allowed, false);
  } finally {
    fixture.databaseClient.close();
  }
});

test('non-owner cannot change access rules while admin can manage', async () => {
  const fixture = await createFixture();

  try {
    await fixture.accessService.updateRule({
      plotId: 'plot-1',
      user: owner,
      accessMode: 'public',
      lockEnabled: false,
    });

    await assert.rejects(
      fixture.accessService.updateRule({
        plotId: 'plot-1',
        user: visitor,
        accessMode: 'private',
      }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );

    const updated = await fixture.accessService.updateRule({
      plotId: 'plot-1',
      user: admin,
      accessMode: 'request',
      lockEnabled: true,
    });
    assert.equal(updated.accessMode, 'request');
    assert.equal(updated.lockEnabled, true);
  } finally {
    fixture.databaseClient.close();
  }
});

test('viewer cannot manage a plot even when mapped as its owner', async () => {
  const fixture = await createFixture();

  try {
    fixture.repositories.accessRules.upsert({
      plotId: 'plot-2',
      ownerUserId: visitor.id,
      accessMode: 'public',
      lockEnabled: false,
    });

    await assert.rejects(
      fixture.accessService.updateRule({
        plotId: 'plot-2',
        user: visitor,
        accessMode: 'private',
      }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );

    await assert.rejects(
      fixture.accessService.setLock({
        plotId: 'plot-2',
        user: visitor,
        locked: true,
      }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );
  } finally {
    fixture.databaseClient.close();
  }
});
