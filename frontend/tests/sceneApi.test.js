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

test('待办⑤ getCaptcha：拉取验证码 id 与图片 data URL', async () => {
  let capturedUrl;
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    fetchImpl: async (url) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          captchaId: 'captcha-1',
          image: 'data:image/svg+xml;base64,PHN2Zz4=',
        }),
        { status: 200 },
      );
    },
  });

  const result = await api.getCaptcha();

  assert.equal(capturedUrl, 'http://localhost:3000/api/scene/route/captcha');
  assert.equal(result.captchaId, 'captcha-1');
  assert.equal(result.image, 'data:image/svg+xml;base64,PHN2Zz4=');
});

test('待办⑤ register：携带验证码提交注册（不携带登录 token 也可）', async () => {
  let captured;
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    getToken: () => '', // 注册为公开端点
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(
        JSON.stringify({
          id: 88,
          username: 'newcomer',
          displayName: '新居民',
          role: 'editor',
          status: 'pending',
        }),
        { status: 201 },
      );
    },
  });

  const result = await api.register({
    username: 'newcomer',
    password: 'secret123',
    displayName: '新居民',
    captchaId: 'captcha-1',
    captchaAnswer: '2345',
  });

  assert.equal(captured.url, 'http://localhost:3000/api/scene/route/register');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(captured.options.body), {
    username: 'newcomer',
    password: 'secret123',
    displayName: '新居民',
    captchaId: 'captcha-1',
    captchaAnswer: '2345',
  });
  assert.equal(result.status, 'pending');
});

test('待办⑤ register：验证码错误 → 抛出 CAPTCHA_INVALID', async () => {
  const api = createSceneApi({
    baseUrl: 'http://localhost:3000/api',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 'CAPTCHA_INVALID',
          message: '验证码错误或已过期，请刷新后重试',
        }),
        { status: 403 },
      ),
  });

  await assert.rejects(
    api.register({
      username: 'newcomer',
      password: 'secret123',
      displayName: '新居民',
      captchaId: 'captcha-1',
      captchaAnswer: '0000',
    }),
    (error) =>
      error instanceof SceneApiError &&
      error.code === 'CAPTCHA_INVALID' &&
      error.statusCode === 403,
  );
});

