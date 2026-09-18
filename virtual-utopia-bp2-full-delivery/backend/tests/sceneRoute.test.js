import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const validModelResult = {
  reply: '大院场景已响应',
  risk: 'low',
  sceneId: 'yard',
  actions: [],
};

const startTestServer = async (modelClient) =>
  new Promise((resolve) => {
    const app = createApp({ modelClient });
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

test('lists all scenes and branch agents', async (context) => {
  const server = await startTestServer({
    createStructuredResponse: async () => {
      throw new Error('model should not be called');
    },
  });

  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/scenes`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.scenes.length, 6);
  assert.equal(payload.agents.length, 5);
});

test('routes a valid scene request through the model client', async (context) => {
  let modelRequest;
  const server = await startTestServer({
    createStructuredResponse: async (request) => {
      modelRequest = request;

      return {
        data: validModelResult,
        model: 'mock-deepseek',
        attempts: 1,
        latencyMs: 12,
        usage: null,
      };
    },
  });

  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/scene/route`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sceneId: 'yard',
        input: {
          content: '你好',
        },
        history: [
          {
            role: 'assistant',
            content: '你好，这里是大院。',
          },
        ],
      }),
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sceneId, 'yard');
  assert.deepEqual(payload.result, {
    ...validModelResult,
    intent: 'greeting',
  });
  assert.equal(payload.meta.model, 'mock-deepseek');
  assert.equal(payload.meta.targetAgentId, 'ahe');
  assert.equal(modelRequest.messages[0].role, 'system');
  assert.equal(modelRequest.messages.at(-1).content, '你好');
  assert.equal(
    modelRequest.responseSchema.properties.sceneId.enum.includes('yard'),
    true,
  );
});

test('rejects an unsupported scene before calling the model', async (context) => {
  let modelCalled = false;
  const server = await startTestServer({
    createStructuredResponse: async () => {
      modelCalled = true;
      throw new Error('model should not be called');
    },
  });

  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/scene/route`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sceneId: 'unknown',
        input: {
          content: '测试',
        },
      }),
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, 'SessionError');
  assert.equal(modelCalled, false);
});

test('falls back when a model response targets the wrong scene', async (context) => {
  const server = await startTestServer({
    createStructuredResponse: async () => ({
      data: {
        ...validModelResult,
        sceneId: 'library',
      },
      model: 'mock-deepseek',
      attempts: 1,
      latencyMs: 10,
      usage: null,
    }),
  });

  context.after(() => server.close());

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/scene/route`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sceneId: 'yard',
        input: {
          content: '测试',
        },
      }),
    },
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.meta.fallback, true);
  assert.equal(payload.meta.fallbackReason, 'SCENE_RESPONSE_INVALID');
});
