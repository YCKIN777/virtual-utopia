// backend/tests/registerRoute.test.js
// 待办⑤：注册代理端点单测 —— 验证码校验 → 转发 phase5；错误透传。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRegisterRouter } from '../src/routes/register.js';
import { createCaptchaService } from '../src/services/captchaService.js';

const PHASE5_BASE_URL = 'http://phase5.test';

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const runRegister = async ({
  body,
  phase5Response,
  phase5Throws = false,
  captchaAnswer,
}) => {
  const captcha = createCaptchaService();
  const { captchaId, image } = captcha.create();

  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });

    if (phase5Throws) {
      throw new Error('network down');
    }

    return phase5Response;
  };

  const router = createRegisterRouter({
    phase5BaseUrl: PHASE5_BASE_URL,
    captcha,
    fetchImpl,
  });

  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({
      error: error.name || 'InternalServerError',
      message: error.message,
      code: error.code || undefined,
    });
  });

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${base}/api/scene/route/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'newcomer',
        password: 'secret123',
        displayName: '新居民',
        captchaId,
        captchaAnswer: captchaAnswer ?? extractAnswer(image),
      }),
    });
    const payload = await response.json().catch(() => null);

    return { status: response.status, payload, requests };
  } finally {
    server.close();
  }
};

const extractAnswer = (dataUrl) => {
  const svg = Buffer.from(
    dataUrl.slice('data:image/svg+xml;base64,'.length),
    'base64',
  ).toString('utf8');
  const texts = [...svg.matchAll(/<text [^>]*>(\d)<\/text>/g)].map(
    (match) => match[1],
  );

  return texts.join('');
};

test('register：验证码正确 → 转发 phase5 并返回 pending 申请', async () => {
  const result = await runRegister({
    phase5Response: jsonResponse(201, {
      id: 88,
      username: 'newcomer',
      displayName: '新居民',
      role: 'editor',
      status: 'pending',
    }),
  });

  assert.equal(result.status, 201);
  assert.equal(result.payload.status, 'pending');
  assert.equal(result.payload.role, 'editor');
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].url, `${PHASE5_BASE_URL}/api/phase5/auth/register`);
  const forwarded = JSON.parse(result.requests[0].init.body);

  assert.equal(forwarded.username, 'newcomer');
  assert.equal(forwarded.password, 'secret123');
  assert.equal(forwarded.displayName, '新居民');
  assert.equal(forwarded.captchaId, undefined); // 验证码不转发给 phase5
});

test('register：验证码错误 → 403 CAPTCHA_INVALID，不转发 phase5', async () => {
  const result = await runRegister({
    phase5Response: jsonResponse(201, { status: 'pending' }),
    captchaAnswer: '0000',
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.code, 'CAPTCHA_INVALID');
  assert.equal(result.requests.length, 0);
});

test('register：入参校验失败 → 400 VALIDATION_ERROR（不经过验证码）', async () => {
  const captcha = createCaptchaService();
  const router = createRegisterRouter({
    phase5BaseUrl: PHASE5_BASE_URL,
    captcha,
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({
      error: error.name,
      message: error.message,
      code: error.code,
    });
  });
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/scene/route/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'ab',
          password: '123',
          displayName: 'x',
        }),
      },
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'VALIDATION_ERROR');
  } finally {
    server.close();
  }
});

test('register：phase5 校验错误透传（用户名占用）', async () => {
  const result = await runRegister({
    phase5Response: jsonResponse(400, {
      code: 'PHASE5_VALIDATION_ERROR',
      message: '用户名已被占用',
    }),
  });

  assert.equal(result.status, 400);
  assert.equal(result.payload.message, '用户名已被占用');
});

test('register：phase5 不可达 → 503 REGISTER_SERVICE_UNAVAILABLE', async () => {
  const result = await runRegister({ phase5Throws: true });

  assert.equal(result.status, 503);
  assert.equal(result.payload.code, 'REGISTER_SERVICE_UNAVAILABLE');
});
