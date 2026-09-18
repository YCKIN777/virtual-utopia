import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Bp4ForbiddenError } from '../../../m1/backend/src/errors.js';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { createChatService } from '../src/chatService.js';
import { openModuleBDatabase } from '../src/database.js';
import { createModuleBRepositories } from '../src/repositories.js';
import { createSensitiveFilter } from '../src/sensitiveFilter.js';

const owner = {
  id: 1,
  username: 'owner',
  role: 'editor',
};
const visitor = {
  id: 2,
  username: 'visitor',
  role: 'viewer',
};

const createFixture = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bp4-module-b-'));
  const database = await openModuleBDatabase({
    databasePath: path.join(directory, 'module-b.sqlite'),
  });
  const repositories = createModuleBRepositories(database);
  const realtimeHub = createRealtimeHub();
  const channelAccess = {
    async authorize({ user, channel }) {
      if (channel.type === 'home' && channel.plotId === 'plot-9') {
        throw new Bp4ForbiddenError('Home channel is forbidden');
      }

      if (
        channel.type === 'direct' &&
        channel.targetUserId &&
        channel.targetUserId !== user.id
      ) {
        return {
          type: 'direct',
          id: `dm-${Math.min(
            user.id,
            channel.targetUserId,
          )}-${Math.max(user.id, channel.targetUserId)}`,
          participantIds: [user.id, channel.targetUserId].sort(
            (left, right) => left - right,
          ),
        };
      }

      return {
        type: channel.type,
        id:
          channel.type === 'world'
            ? 'world-main'
            : channel.type === 'home'
              ? `home-${channel.plotId}`
              : channel.id,
      };
    },
  };
  const service = createChatService({
    repositories,
    channelAccess,
    sensitiveFilter: createSensitiveFilter(),
    realtimeHub,
  });

  return {
    database,
    directory,
    realtimeHub,
    repositories,
    service,
  };
};

test('world chat persists, filters sensitive words and returns history', async () => {
  const fixture = await createFixture();
  const connection = fixture.realtimeHub.registerConnection({
    user: owner,
    channelIds: ['world-main'],
  });

  try {
    const result = await fixture.service.sendMessage({
      user: owner,
      authorization: 'Bearer owner',
      channel: { type: 'world' },
      content: 'hello shit 诈骗',
    });

    assert.equal(result.message.content, 'hello *** ***');
    assert.equal(result.message.filtered, true);
    assert.deepEqual(result.filteredTerms, ['shit', '诈骗']);
    assert.equal(
      fixture.realtimeHub.resume(connection.connectionId, 'world-main', 0)
        .length,
      1,
    );

    const history = await fixture.service.listHistory({
      user: visitor,
      authorization: 'Bearer visitor',
      channel: { type: 'world' },
    });

    assert.equal(history.messages.length, 1);
    assert.equal(history.messages[0].id, result.message.id);
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});

test('home channel respects permission service and private home messages persist', async () => {
  const fixture = await createFixture();

  try {
    const sent = await fixture.service.sendMessage({
      user: owner,
      authorization: 'Bearer owner',
      channel: {
        type: 'home',
        plotId: 'plot-1',
      },
      content: 'home hello',
    });

    assert.equal(sent.channel.id, 'home-plot-1');
    const history = await fixture.service.listHistory({
      user: owner,
      authorization: 'Bearer owner',
      channel: {
        type: 'home',
        plotId: 'plot-1',
      },
    });

    assert.equal(history.messages[0].content, 'home hello');
    await assert.rejects(
      fixture.service.listHistory({
        user: visitor,
        authorization: 'Bearer visitor',
        channel: {
          type: 'home',
          plotId: 'plot-9',
        },
      }),
      {
        code: 'BP4_FORBIDDEN',
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

test('direct chat uses canonical participant channel and recall is sender-only', async () => {
  const fixture = await createFixture();

  try {
    const direct = await fixture.service.sendMessage({
      user: owner,
      authorization: 'Bearer owner',
      channel: {
        type: 'direct',
        targetUserId: visitor.id,
      },
      content: 'direct hello',
    });

    assert.equal(direct.channel.id, 'dm-1-2');
    await assert.rejects(
      fixture.service.recallMessage({
        user: visitor,
        authorization: 'Bearer visitor',
        messageId: direct.message.id,
      }),
      {
        code: 'BP4_FORBIDDEN',
      },
    );

    const recalled = await fixture.service.recallMessage({
      user: owner,
      authorization: 'Bearer owner',
      messageId: direct.message.id,
    });

    assert.equal(recalled.message.status, 'recalled');
    assert.equal(recalled.message.content, '[消息已撤回]');
  } finally {
    fixture.database.close();
    await rm(fixture.directory, {
      recursive: true,
      force: true,
    });
  }
});
