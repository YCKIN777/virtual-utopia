// backend/tests/resumeRoute.test.js
// 待办⑥：resume 归属校验 —— admin 任意 / owner 放行 / 非 owner 403 / 无记录非 admin 403 / 游客 403 / 缺 conversationId 400。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createResumeRouter } from '../src/routes/resume.js';
import { createConversationRegistry } from '../src/services/conversationRegistry.js';

const runResume = async ({ userContext, conversationId, registrySetup }) => {
  const registry = createConversationRegistry();

  registrySetup?.(registry);

  const resumeCalls = [];
  const router = createResumeRouter({
    conversationRegistry: registry,
    orchestrator: {
      async resume(body) {
        resumeCalls.push(body);

        return { ok: true, conversationId: body.conversationId };
      },
    },
  });

  const app = express();
  app.use(express.json());
  // 模拟 sceneAuth：注入 userContext
  app.use((request, _response, next) => {
    request.userContext = userContext ?? null;
    next();
  });
  app.use(router);

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/scene/route/resume`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          decision: { approved: true, reason: '同意' },
        }),
      },
    );
    const payload = await response.json().catch(() => null);

    return { status: response.status, payload, resumeCalls };
  } finally {
    server.close();
  }
};

test('admin：任意 conversationId 可审批（KIN 管理通道）', async () => {
  const result = await runResume({
    userContext: { userId: 40, role: 'admin', username: 'KIN' },
    conversationId: 'conv-any',
  });

  assert.equal(result.status, 200);
  assert.equal(result.resumeCalls.length, 1);
});

test('owner：会话归属匹配 → 放行（恢复自己的会话）', async () => {
  const result = await runResume({
    userContext: { userId: 7, role: 'editor', username: 'resident7' },
    conversationId: 'conv-7',
    registrySetup: (registry) =>
      registry.register('conv-7', { userId: 7, role: 'editor' }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.resumeCalls.length, 1);
});

test('非 owner：归属不匹配 → 403 且不调 orchestrator', async () => {
  const result = await runResume({
    userContext: { userId: 8, role: 'editor', username: 'resident8' },
    conversationId: 'conv-7',
    registrySetup: (registry) =>
      registry.register('conv-7', { userId: 7, role: 'editor' }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.error, 'FORBIDDEN');
  assert.equal(result.resumeCalls.length, 0);
});

test('非 admin：conversationId 无归属记录 → 403（防伪造）', async () => {
  const result = await runResume({
    userContext: { userId: 7, role: 'editor', username: 'resident7' },
    conversationId: 'conv-unknown',
  });

  assert.equal(result.status, 403);
  assert.equal(result.payload.error, 'FORBIDDEN');
  assert.equal(result.resumeCalls.length, 0);
});

test('游客（无 userContext）：403', async () => {
  const result = await runResume({
    userContext: null,
    conversationId: 'conv-7',
    registrySetup: (registry) =>
      registry.register('conv-7', { userId: 7, role: 'editor' }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.resumeCalls.length, 0);
});

test('缺 conversationId：400 INVALID_REQUEST', async () => {
  const result = await runResume({
    userContext: { userId: 40, role: 'admin', username: 'KIN' },
    conversationId: null,
  });

  assert.equal(result.status, 400);
  assert.equal(result.payload.error, 'INVALID_REQUEST');
  assert.equal(result.resumeCalls.length, 0);
});
