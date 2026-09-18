import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeAccessService } from '../../../backend/src/accessService.js';
import { createRepositories } from '../../../backend/src/repositories.js';
import { createAvatarService } from '../src/avatarService.js';
import { openP2Database } from '../src/database.js';
import { createMessageService } from '../src/messageService.js';
import { createP2Repositories } from '../src/repositories.js';

const owner = {
  id: 1,
  username: 'owner',
  role: 'editor',
  displayName: 'Owner',
};

const visitor = {
  id: 2,
  username: 'visitor',
  role: 'viewer',
  displayName: 'Visitor',
};

const admin = {
  id: 3,
  username: 'admin',
  role: 'admin',
  displayName: 'Admin',
};

const createFixture = async () => {
  const databaseClient = await openP2Database({
    databasePath: ':memory:',
  });
  const p0Repositories = createRepositories(databaseClient);
  const repositories = createP2Repositories(databaseClient);
  const authService = {
    resolveOwnedPlot: async ({ user }) =>
      user.id === owner.id ? 'plot-1' : 'plot-2',
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
    repositories: p0Repositories,
    authService,
  });

  return {
    accessService,
    avatarService: createAvatarService({ repositories }),
    databaseClient,
    messageService: createMessageService({
      config: {
        messageLimit: 200,
      },
      repositories,
      accessService,
    }),
    repositories,
  };
};

test('avatar actions and emotes synchronize by authenticated user', async () => {
  const fixture = await createFixture();

  try {
    const catalog = fixture.avatarService.listCatalog();

    assert.ok(catalog.actions.some((action) => action.id === 'wave'));
    assert.ok(catalog.emotes.some((emote) => emote.id === 'happy'));

    const state = fixture.avatarService.updateState({
      user: visitor,
      actionId: 'wave',
      emoteId: 'happy',
    });

    assert.equal(state.userId, visitor.id);
    assert.equal(state.actionId, 'wave');
    assert.equal(state.emoteId, 'happy');
    assert.equal(state.sequence, 1);
    assert.equal(fixture.avatarService.getState(visitor.id).actionId, 'wave');
  } finally {
    fixture.databaseClient.close();
  }
});

test('home messages enforce plot access and author/owner deletion', async () => {
  const fixture = await createFixture();

  try {
    await fixture.accessService.updateRule({
      plotId: 'plot-1',
      user: owner,
      accessMode: 'public',
      lockEnabled: false,
    });
    const visitorMessage = await fixture.messageService.create({
      plotId: 'plot-1',
      user: visitor,
      content: '欢迎来到庄园',
    });
    const ownerMessage = await fixture.messageService.create({
      plotId: 'plot-1',
      user: owner,
      content: '谢谢来访',
    });

    const messages = await fixture.messageService.list({
      plotId: 'plot-1',
      user: admin,
    });
    assert.equal(messages.length, 2);

    await fixture.messageService.remove({
      plotId: 'plot-1',
      messageId: visitorMessage.id,
      user: visitor,
    });
    await fixture.messageService.remove({
      plotId: 'plot-1',
      messageId: ownerMessage.id,
      user: owner,
    });

    const remaining = await fixture.messageService.list({
      plotId: 'plot-1',
      user: owner,
    });
    assert.equal(remaining.length, 0);

    await fixture.accessService.updateRule({
      plotId: 'plot-2',
      user: admin,
      accessMode: 'private',
      lockEnabled: true,
    });
    await assert.rejects(
      fixture.messageService.create({
        plotId: 'plot-2',
        user: owner,
        content: '不应写入',
      }),
      {
        code: 'BP3_FORBIDDEN',
      },
    );
  } finally {
    fixture.databaseClient.close();
  }
});
