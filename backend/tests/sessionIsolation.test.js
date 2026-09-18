import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionBoundary } from '../src/services/sessionBoundary.js';
import {
  SessionError,
  createSessionStore,
} from '../src/services/sessionStore.js';

const createFixedId = () => {
  let sequence = 0;

  return () =>
    `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
};

const createStore = (options = {}) =>
  createSessionStore({
    createId: createFixedId(),
    ...options,
  });

test('creates public and private sessions with distinct identifiers', () => {
  const store = createStore();
  const publicSession = store.createSession({
    sceneId: 'yard',
    type: 'public',
    ownerAgentId: 'ahe',
  });
  const privateSession = store.createSession({
    sceneId: 'cabin',
    type: 'private',
    ownerAgentId: 'fenghe',
  });

  assert.match(publicSession.id, /^pub_/);
  assert.match(privateSession.id, /^prv_/);
  assert.notEqual(publicSession.id, privateSession.id);
});

test('removes expired sessions during cleanup', () => {
  let currentTime = 1000;
  const store = createStore({
    ttlMs: 100,
    now: () => currentTime,
  });

  store.createSession({
    sceneId: 'yard',
    type: 'public',
    ownerAgentId: 'ahe',
  });

  currentTime = 1101;

  assert.equal(store.cleanup(), 1);
  assert.equal(store.size, 0);
});

test('evicts the oldest session when capacity is reached', () => {
  let currentTime = 1000;
  const store = createStore({
    maxCount: 2,
    now: () => currentTime,
  });

  const first = store.createSession({
    sceneId: 'yard',
    type: 'public',
    ownerAgentId: 'ahe',
  });
  currentTime += 1;
  store.createSession({
    sceneId: 'resource-wall',
    type: 'public',
    ownerAgentId: 'zhiyu',
  });
  currentTime += 1;
  store.createSession({
    sceneId: 'library',
    type: 'public',
    ownerAgentId: 'suian',
  });

  assert.equal(store.size, 2);
  assert.throws(() => store.getSession(first.id), {
    code: 'SESSION_NOT_FOUND',
  });
});

test('isolates cabin private context from public scenes and agents', async () => {
  const store = createStore();
  const requests = [];
  const boundary = createSessionBoundary({
    sessionStore: store,
    orchestrator: {
      async handle(body) {
        requests.push({
          ...body,
          history: body.history.map((message) => ({ ...message })),
        });

        return {
          sceneId: body.sceneId,
          sceneName: '小屋',
          result: {
            reply: '风禾回复',
          },
          meta: {
            targetAgentId: 'fenghe',
          },
        };
      },
    },
  });

  const first = await boundary.handle({
    sceneId: 'cabin',
    input: {
      content: '私密消息',
    },
  });

  assert.equal(first.meta.session.type, 'private');
  assert.equal(first.meta.session.ownerAgentId, 'fenghe');
  assert.match(first.meta.session.id, /^prv_/);

  await boundary.handle({
    sceneId: 'cabin',
    sessionId: first.meta.session.id,
    input: {
      content: '第二条私密消息',
    },
    history: [
      {
        role: 'user',
        content: '伪造的公共历史',
      },
    ],
  });

  assert.deepEqual(requests[1].history, [
    {
      role: 'user',
      content: '私密消息',
    },
    {
      role: 'assistant',
      content: '风禾回复',
    },
  ]);

  await assert.rejects(
    boundary.handle({
      sceneId: 'yard',
      sessionId: first.meta.session.id,
      input: {
        content: '越权读取',
      },
    }),
    {
      code: 'SESSION_SCOPE_VIOLATION',
      statusCode: 403,
    },
  );
});

test('isolates public scene sessions from each other', async () => {
  const store = createStore();
  const boundary = createSessionBoundary({
    sessionStore: store,
    orchestrator: {
      async handle(body) {
        return {
          sceneId: body.sceneId,
          sceneName: '公共场景',
          result: {
            reply: '公共回复',
          },
          meta: {
            targetAgentId: body.sceneId,
          },
        };
      },
    },
  });

  const yard = await boundary.handle({
    sceneId: 'yard',
    input: {
      content: '大院消息',
    },
  });
  const library = await boundary.handle({
    sceneId: 'library',
    input: {
      content: '书屋消息',
    },
  });

  assert.notEqual(yard.meta.session.id, library.meta.session.id);
  assert.equal(yard.meta.session.sceneId, 'yard');
  assert.equal(library.meta.session.sceneId, 'library');

  await assert.rejects(
    boundary.handle({
      sceneId: 'library',
      sessionId: yard.meta.session.id,
      input: {
        content: '跨场景读取',
      },
    }),
    {
      code: 'SESSION_SCOPE_VIOLATION',
      statusCode: 403,
    },
  );
});

test('rejects invalid session identifiers and unavailable scenes', async () => {
  const boundary = createSessionBoundary({
    sessionStore: createStore(),
    orchestrator: {
      async handle() {
        throw new Error('orchestrator should not be called');
      },
    },
  });

  await assert.rejects(
    boundary.handle({
      sceneId: 'cabin',
      sessionId: 'invalid',
      input: {
        content: '测试',
      },
    }),
    SessionError,
  );

  await assert.rejects(
    boundary.handle({
      sceneId: 'far-forest',
      input: {
        content: '测试',
      },
    }),
    {
      code: 'SCENE_NOT_AVAILABLE',
    },
  );
});
