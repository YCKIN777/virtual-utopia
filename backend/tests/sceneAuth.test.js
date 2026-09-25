// backend/tests/sceneAuth.test.js
// P4 收尾：场景服务真实认证 ——
//  ① sceneAuth 中间件：无 token→游客(null)、有效 token→userContext、无效→401、服务不可达→503；
//  ② resume 路由：仅 admin 可审批（游客/viewer/editor 403）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  createSceneAuthMiddleware,
  SceneAuthError,
} from '../src/middleware/sceneAuth.js';
import { createResumeRouter } from '../src/routes/resume.js';

const PHASE6_BASE_URL = 'http://phase6.test';

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// 用真实 Express 小服务跑中间件（覆盖 next/401/503 分支）。
const runMiddleware = async ({ authorization, meResponse, meThrows = false }) => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, `${PHASE6_BASE_URL}/api/phase6/auth/me`);
    assert.equal(init.headers.Authorization, authorization);

    if (meThrows) {
      throw new Error('network down');
    }

    return meResponse;
  };

  const middleware = createSceneAuthMiddleware({
    phase6BaseUrl: PHASE6_BASE_URL,
    fetchImpl,
  });

  let captured = null;
  const nextCalled = { value: false };
  const app = express();
  app.use(middleware);
  app.use((request, _response, next) => {
    captured = request.userContext;
    nextCalled.value = true;
    next();
  });
  app.use((request, response) => {
    response.json({ ok: true, userContext: request.userContext });
  });

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${base}/api/scene/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ sceneId: 'cabin' }),
    });
    const body = await response.json().catch(() => null);

    return { status: response.status, body, captured, nextCalled: nextCalled.value };
  } finally {
    server.close();
  }
};

test('sceneAuth：无 token → 游客（userContext=null），请求继续', async () => {
  const result = await runMiddleware({ authorization: null });

  assert.equal(result.status, 200);
  assert.equal(result.captured, null);
  assert.equal(result.nextCalled, true);
});

test('sceneAuth：有效 Bearer token → 解析为 userContext（id→userId 归一化）', async () => {
  const meResponse = jsonResponse(200, {
    id: 40,
    username: 'KIN',
    role: 'admin',
    displayName: 'KIN（城主 · 管理员）',
  });
  const result = await runMiddleware({
    authorization: 'Bearer token-kin',
    meResponse,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.captured, {
    userId: 40,
    username: 'KIN',
    role: 'admin',
  });
});

test('sceneAuth：viewer 角色也可解析（游客账号身份）', async () => {
  const meResponse = jsonResponse(200, {
    id: 99,
    username: 'guest01',
    role: 'viewer',
  });
  const result = await runMiddleware({
    authorization: 'Bearer token-viewer',
    meResponse,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.captured, {
    userId: 99,
    username: 'guest01',
    role: 'viewer',
  });
});

test('sceneAuth：token 无效（phase6 401）→ 401，不继续', async () => {
  const result = await runMiddleware({
    authorization: 'Bearer token-expired',
    meResponse: jsonResponse(401, {
      error: 'UNAUTHORIZED',
      message: '登录已失效',
    }),
  });

  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test('sceneAuth：认证服务不可达 → 503，不静默降级为游客', async () => {
  const result = await runMiddleware({
    authorization: 'Bearer token-any',
    meThrows: true,
  });

  assert.equal(result.status, 503);
  assert.equal(result.nextCalled, false);
});

test('SceneAuthError 可携带 code/statusCode', () => {
  const error = new SceneAuthError('boom', { code: 'AUTH_FAILED' });

  assert.equal(error.name, 'SceneAuthError');
  assert.equal(error.code, 'AUTH_FAILED');
});

// ---- resume 路由：仅 admin 可审批 ----
const startResumeServer = async (userContext) => {
  const resumeCalls = [];
  const orchestrator = {
    async resume(body) {
      resumeCalls.push(body);

      return {
        sceneId: 'cabin',
        sceneName: '小屋',
        result: { reply: '已批准' },
        meta: { session: null },
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.userContext = userContext;
    next();
  });
  app.use('/api', createResumeRouter({ orchestrator }));

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    server,
    resumeCalls,
  };
};

const callResume = async (base, { conversationId = 'conv-1', approved = true } = {}) => {
  const response = await fetch(`${base}/api/scene/route/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      decision: { approved },
    }),
  });
  const body = await response.json().catch(() => null);

  return { status: response.status, body };
};

test('resume：admin 可审批并转发', async () => {
  const { base, server, resumeCalls } = await startResumeServer({
    userId: 40,
    username: 'KIN',
    role: 'admin',
  });

  try {
    const result = await callResume(base);

    assert.equal(result.status, 200);
    assert.equal(result.body.result.reply, '已批准');
    assert.equal(resumeCalls.length, 1);
  } finally {
    server.close();
  }
});

test('resume：游客（userContext=null）403', async () => {
  const { base, server, resumeCalls } = await startResumeServer(null);

  try {
    const result = await callResume(base);

    assert.equal(result.status, 403);
    assert.equal(resumeCalls.length, 0);
  } finally {
    server.close();
  }
});

test('resume：editor 非 admin 403', async () => {
  const { base, server, resumeCalls } = await startResumeServer({
    userId: 1,
    username: 'traveler',
    role: 'editor',
  });

  try {
    const result = await callResume(base);

    assert.equal(result.status, 403);
    assert.equal(resumeCalls.length, 0);
  } finally {
    server.close();
  }
});
