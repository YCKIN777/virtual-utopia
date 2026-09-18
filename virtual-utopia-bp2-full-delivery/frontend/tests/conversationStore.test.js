import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationStore } from '../src/stores/conversationStore.js';

const createReply = (reply, sceneId) => ({
  result: {
    reply,
    sceneId,
  },
  meta: {
    targetAgentId: sceneId,
    session: {
      id: `pub_00000000-0000-4000-8000-${String(sceneId.length).padStart(
        12,
        '0',
      )}`,
      sceneId,
    },
  },
});

test('isolates conversation context between scenes', async () => {
  const requests = [];
  let messageId = 0;
  const store = createConversationStore({
    createId: () => `message-${++messageId}`,
    requestMessage: async (payload) => {
      requests.push(payload);
      return createReply(`回复-${payload.sceneId}`, payload.sceneId);
    },
  });

  await store.sendMessage('yard', '大院消息');
  await store.sendMessage('cabin', '小屋消息');
  await store.sendMessage('yard', '大院第二条');

  assert.deepEqual(
    store.getConversation('yard').messages.map((message) => message.content),
    ['大院消息', '回复-yard', '大院第二条', '回复-yard'],
  );
  assert.deepEqual(
    store.getConversation('cabin').messages.map((message) => message.content),
    ['小屋消息', '回复-cabin'],
  );
  assert.equal(store.conversations.size, 2);
  assert.match(store.getConversation('yard').sessionId, /^pub_/);
  assert.equal(requests[2].sessionId, store.getConversation('yard').sessionId);
  assert.deepEqual(requests[2].history, [
    {
      role: 'user',
      content: '大院消息',
    },
    {
      role: 'assistant',
      content: '回复-yard',
    },
  ]);
});

test('rejects unknown, unavailable and empty messages before calling the API', async () => {
  let requestCount = 0;
  const store = createConversationStore({
    requestMessage: async () => {
      requestCount += 1;
      return createReply('不应调用', 'yard');
    },
  });

  await assert.rejects(store.sendMessage('unknown', '测试'), {
    message: '未知场景',
  });
  await assert.rejects(store.sendMessage('far-forest', '测试'), {
    message: '该场景尚未开放',
  });
  await assert.rejects(store.sendMessage('yard', '   '), {
    message: '消息不能为空',
  });
  assert.equal(requestCount, 0);
});

test('does not persist conversation data outside memory', async () => {
  const store = createConversationStore({
    createId: () => 'message-1',
    requestMessage: async () => createReply('当前进程内存中的回复', 'library'),
  });

  await store.sendMessage('library', '测试');

  assert.equal(store.getConversation('library').messages.length, 2);
  assert.equal(Object.hasOwn(globalThis, 'localStorage'), false);
});

test('recreates an expired session and retries once', async () => {
  const requests = [];
  const store = createConversationStore({
    createId: () => `message-${requests.length + 1}`,
    requestMessage: async (payload) => {
      requests.push(payload);

      if (requests.length === 1) {
        const error = new Error('会话已过期');
        error.code = 'SESSION_NOT_FOUND';
        throw error;
      }

      return {
        result: {
          reply: '重试成功',
          sceneId: 'cabin',
        },
        meta: {
          session: {
            id: 'prv_00000000-0000-4000-8000-000000000001',
            sceneId: 'cabin',
          },
        },
      };
    },
  });
  const conversation = store.getConversation('cabin');
  conversation.sessionId = 'prv_00000000-0000-4000-8000-000000000099';

  await store.sendMessage('cabin', '测试过期恢复');

  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].sessionId,
    'prv_00000000-0000-4000-8000-000000000099',
  );
  assert.equal(requests[1].sessionId, undefined);
  assert.equal(
    conversation.sessionId,
    'prv_00000000-0000-4000-8000-000000000001',
  );
});
