import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneApiError, createSceneApi } from '../src/services/sceneApi.js';

test('posts scene requests through the backend orchestration endpoint', async () => {
  let capturedRequest;
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    getToken: () => 'token-abc',
    fetchImpl: async (url, options) => {
      capturedRequest = {
        url,
        options,
      };

      return new Response(
        JSON.stringify({
          result: {
            reply: '收到',
          },
          meta: {
            targetAgentId: 'ahe',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    },
  });

  const result = await api.sendMessage({
    sceneId: 'yard',
    sessionId: 'pub_00000000-0000-4000-8000-000000000001',
    input: {
      content: '你好',
    },
    history: [],
  });

  assert.equal(capturedRequest.url, 'http://localhost:3000/api/scene/route');
  assert.equal(capturedRequest.options.method, 'POST');
  // P4 收尾：真实认证 —— 请求自动携带 Bearer token（不再依赖 body.user 直传）。
  assert.equal(
    capturedRequest.options.headers.Authorization,
    'Bearer token-abc',
  );
  assert.deepEqual(JSON.parse(capturedRequest.options.body), {
    sceneId: 'yard',
    sessionId: 'pub_00000000-0000-4000-8000-000000000001',
    input: {
      content: '你好',
    },
    history: [],
  });
  assert.equal(result.result.reply, '收到');
});

test('未登录（无 token）时请求不带 Authorization 头', async () => {
  let capturedHeaders;
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    getToken: () => '',
    fetchImpl: async (_url, options) => {
      capturedHeaders = options.headers;
      return new Response(
        JSON.stringify({
          result: { reply: '收到' },
          meta: { targetAgentId: 'ahe' },
        }),
        { status: 200 },
      );
    },
  });

  await api.sendMessage({
    sceneId: 'yard',
    input: { content: '你好' },
  });

  assert.equal(capturedHeaders.Authorization, undefined);
});

test('blocks unknown or unavailable scenes before sending a request', async () => {
  let requestCount = 0;
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    fetchImpl: async () => {
      requestCount += 1;
      throw new Error('request should not be sent');
    },
  });

  await assert.rejects(
    api.sendMessage({
      sceneId: 'unknown',
      input: {
        content: '测试',
      },
    }),
    {
      code: 'INVALID_SCENE',
    },
  );

  await assert.rejects(
    api.sendMessage({
      sceneId: 'far-forest',
      input: {
        content: '测试',
      },
    }),
    {
      code: 'SCENE_NOT_AVAILABLE',
    },
  );

  assert.equal(requestCount, 0);
});

test('maps backend failures to SceneApiError', async () => {
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 'DEEPSEEK_CONFIGURATION_ERROR',
          message: 'Request failed',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
  });

  await assert.rejects(
    api.sendMessage({
      sceneId: 'yard',
      input: {
        content: '测试',
      },
    }),
    (error) =>
      error instanceof SceneApiError &&
      error.code === 'DEEPSEEK_CONFIGURATION_ERROR' &&
      error.statusCode === 503 &&
      error.message === '模型服务尚未配置，请稍后再试',
  );
});
