import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createBp3App } from '../src/app.js';
import { createHomeAccessService } from '../src/accessService.js';
import { createDatabaseClient, openBp3Database } from '../src/database.js';
import { createRepositories } from '../src/repositories.js';
import { createVoiceService } from '../src/voiceService.js';

const users = new Map([
  [
    'Bearer owner-token',
    {
      id: 1,
      username: 'owner',
      displayName: 'Owner',
      role: 'editor',
    },
  ],
  [
    'Bearer viewer-token',
    {
      id: 2,
      username: 'viewer',
      displayName: 'Viewer',
      role: 'viewer',
    },
  ],
  [
    'Bearer admin-token',
    {
      id: 3,
      username: 'admin',
      displayName: 'Admin',
      role: 'admin',
    },
  ],
]);

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

test('BP3 HTTP app exposes P0 access APIs with server-side auth', async () => {
  const database = await openBp3Database({
    databasePath: ':memory:',
  });
  const databaseClient = createDatabaseClient(database);
  const repositories = createRepositories(databaseClient);
  const authService = {
    authenticate: async (authorization) => {
      const user = users.get(authorization);

      if (!user) {
        const error = new Error('Unauthorized');
        error.code = 'BP3_UNAUTHORIZED';
        error.status = 401;
        throw error;
      }

      return user;
    },
    resolveOwnedPlot: async ({ user }) => `plot-${user.id}`,
    validatePlotId(value) {
      if (!/^plot-\d+$/.test(value)) {
        const error = new Error('Invalid plot');
        error.code = 'BP3_VALIDATION_ERROR';
        error.status = 400;
        throw error;
      }

      return value;
    },
  };
  const accessService = createHomeAccessService({
    config: {
      inviteDefaultTtlSeconds: 3600,
    },
    repositories,
    authService,
  });
  const voiceService = createVoiceService({
    config: {
      authSecret: 'test-secret',
      voiceTokenTtlSeconds: 120,
    },
    repositories,
  });
  const mediasoup = {
    workerCount: () => 1,
  };
  const signaling = {
    moderate: async () => ({
      action: 'mute',
      channelId: 'world-main',
      targetUserId: 2,
    }),
    path: '/ws/bp3/voice/signaling',
  };
  const app = createBp3App({
    config: {
      allowedOrigins: [],
      databasePath: ':memory:',
      phase5BaseUrl: 'http://phase5.invalid',
    },
    repositories,
    authService,
    accessService,
    voiceService,
    signaling,
    mediasoup,
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/api/bp3/homes/plot-1/access`);
    assert.equal(unauthorized.status, 401);

    const updateRule = await fetch(`${baseUrl}/api/bp3/homes/plot-1/access`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer owner-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessMode: 'request',
        lockEnabled: true,
      }),
    });
    assert.equal(updateRule.status, 200);

    const viewerRuleUpdate = await fetch(
      `${baseUrl}/api/bp3/homes/plot-1/access`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer viewer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessMode: 'public',
        }),
      },
    );
    assert.equal(viewerRuleUpdate.status, 403);

    const viewerOwnHomeUpdate = await fetch(
      `${baseUrl}/api/bp3/homes/plot-2/access`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer viewer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessMode: 'private',
        }),
      },
    );
    assert.equal(viewerOwnHomeUpdate.status, 403);

    const viewerOwnHomeLock = await fetch(
      `${baseUrl}/api/bp3/homes/plot-2/unlock`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer viewer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locked: true,
        }),
      },
    );
    assert.equal(viewerOwnHomeLock.status, 403);

    const joinVoice = await fetch(
      `${baseUrl}/api/bp3/voice/channels/world-main/join`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer viewer-token',
        },
      },
    );
    assert.equal(joinVoice.status, 200);
    const joined = await joinVoice.json();
    assert.equal(joined.channel.id, 'world-main');
    assert.equal(typeof joined.token, 'string');

    const viewerModeration = await fetch(
      `${baseUrl}/api/bp3/voice/channels/world-main/moderate`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer viewer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: 1,
          action: 'kick',
        }),
      },
    );
    assert.equal(viewerModeration.status, 403);

    const adminModeration = await fetch(
      `${baseUrl}/api/bp3/voice/channels/world-main/moderate`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: 2,
          action: 'mute',
        }),
      },
    );
    assert.equal(adminModeration.status, 200);
  } finally {
    await closeServer(server);
    databaseClient.close();
  }
});
