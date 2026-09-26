// backend/tests/phase5LoginStatus.test.js
// P5.1-①：登录按账号状态区分错误 —— pending 返回 PHASE5_ACCOUNT_INACTIVE(403)，
// 密码错误保持 PHASE5_UNAUTHORIZED(401)，active 正常登录 200。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPhase5Database } from '../src/phase5/database.js';
import { createRepositories } from '../src/phase5/repositories.js';
import { createPhase5App } from '../src/phase5/httpServer.js';
import { hashPassword, sha256Hex } from '../src/phase5/security.js';

const createTestServer = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phase5-login-'));
  const database = await openPhase5Database({
    databasePath: join(dir, 'test.sqlite'),
    busyTimeoutMs: 1000,
    bootstrapAdminUsername: '',
    bootstrapAdminPassword: '',
  });
  const repositories = createRepositories(database);
  const app = createPhase5App({
    repositories,
    config: {
      authSecret: 'test-secret',
      serviceToken: 'test-service-token',
      tokenTtlSeconds: 3600,
      sessionStorageMode: 'persistent',
      databasePath: join(dir, 'test.sqlite'),
    },
    database,
  });

  const server = app.listen(0);
  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}`,
    repositories,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          database.close();
          resolve();
        });
      }),
  };
};

const login = async (base, username, password) => {
  const response = await fetch(`${base}/api/phase5/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

test('pending 账号密码正确 → 403 PHASE5_ACCOUNT_INACTIVE 且带状态', async () => {
  const ctx = await createTestServer();
  try {
    const passwordHash = await hashPassword('utopia2026');
    ctx.repositories.users.create({
      username: 'pending_user',
      passwordHash,
      role: 'editor',
      status: 'pending',
      displayName: '待审居民',
    });

    const { status, payload } = await login(ctx.base, 'pending_user', 'utopia2026');
    assert.equal(status, 403);
    assert.equal(payload.code, 'PHASE5_ACCOUNT_INACTIVE');
    assert.match(payload.message, /审批/);
    assert.equal(payload.error, 'Phase5AccountInactiveError');
  } finally {
    await ctx.close();
  }
});

test('密码错误 → 401 PHASE5_UNAUTHORIZED（保持原行为）', async () => {
  const ctx = await createTestServer();
  try {
    const passwordHash = await hashPassword('utopia2026');
    ctx.repositories.users.create({
      username: 'pending_user2',
      passwordHash,
      role: 'editor',
      status: 'pending',
      displayName: '待审居民2',
    });

    const { status, payload } = await login(ctx.base, 'pending_user2', 'wrongpass');
    assert.equal(status, 401);
    assert.equal(payload.code, 'PHASE5_UNAUTHORIZED');
    assert.equal(payload.message, 'invalid username or password');
  } finally {
    await ctx.close();
  }
});

test('active 账号正常登录 200', async () => {
  const ctx = await createTestServer();
  try {
    const passwordHash = await hashPassword(sha256Hex('utopia2026'));
    ctx.repositories.users.create({
      username: 'active_user',
      passwordHash,
      role: 'editor',
      status: 'active',
      displayName: '在籍居民',
    });

    // 模拟前端 sha256 传输
    const { status, payload } = await login(
      ctx.base,
      'active_user',
      sha256Hex('utopia2026'),
    );
    assert.equal(status, 200);
    assert.ok(payload.token);
    assert.equal(payload.user.username, 'active_user');
  } finally {
    await ctx.close();
  }
});
