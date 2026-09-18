import assert from 'node:assert/strict';
import { createAvatarService } from '../backend/src/avatarService.js';
import { openP2Database } from '../backend/src/database.js';
import { createP2Repositories } from '../backend/src/repositories.js';

const databaseClient = await openP2Database({
  databasePath: ':memory:',
});

try {
  const repositories = createP2Repositories(databaseClient);
  const avatarService = createAvatarService({ repositories });
  const avatarStartedAt = performance.now();

  for (let index = 0; index < 500; index += 1) {
    avatarService.updateState({
      user: {
        id: 2,
        username: 'traveler',
      },
      actionId: index % 2 ? 'wave' : 'clap',
      emoteId: index % 3 ? 'happy' : null,
    });
  }

  const avatarDurationMs = performance.now() - avatarStartedAt;
  const messageStartedAt = performance.now();

  for (let index = 0; index < 300; index += 1) {
    repositories.messages.create({
      plotId: 'plot-1',
      author: {
        id: 2,
        username: 'traveler',
        displayName: '漫游者',
      },
      content: `性能测试留言 ${index}`,
    });
  }

  const messages = repositories.messages.list('plot-1', 100);
  const messageDurationMs = performance.now() - messageStartedAt;

  assert.equal(messages.length, 100);
  assert.ok(avatarDurationMs < 3000);
  assert.ok(messageDurationMs < 3000);

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        avatarUpdates: 500,
        avatarDurationMs: Math.round(avatarDurationMs),
        messagesCreated: 300,
        messageListDurationMs: Math.round(messageDurationMs),
      },
      null,
      2,
    ),
  );
} finally {
  databaseClient.close();
}
