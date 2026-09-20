import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuditStore } from '../auditStore.js';
import { createPhase6App } from '../app.js';
import { createVisitorQuotaStore } from '../visitorQuotaStore.js';
import { createPlotAssignmentStore } from '../plotAssignmentStore.js';

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

// ---- 内存版 phase5 mock（支持注册/审核/密码接口） ----
const createPhase5Mock = () => {
  let nextId = 100;
  const records = [
    {
      id: 1,
      username: 'admin',
      password: 'admin-password',
      role: 'admin',
      status: 'active',
      displayName: '管理员',
      createdAt: '2026-09-20T00:00:00.000Z',
    },
  ];
  const tokens = new Map(); // token -> user

  const findUser = (username) =>
    records.find((record) => record.username === username);

  const publicUser = (record) => ({
    id: record.id,
    username: record.username,
    role: record.role,
    status: record.status,
    displayName: record.displayName,
    lastLoginAt: record.lastLoginAt || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt || record.createdAt,
  });

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const authorization = request.headers.authorization || '';
    const token = authorization.replace(/^Bearer\s+/, '');
    const user = tokens.get(token) || null;

    if (url.pathname === '/api/phase5/auth/login') {
      const body = await readJson(request);
      const record = findUser(body.username);

      if (!record || record.password !== body.password || record.status !== 'active') {
        sendJson(response, 401, {
          error: 'Phase5UnauthorizedError',
          code: 'PHASE5_UNAUTHORIZED',
          message: 'invalid username or password',
        });
        return;
      }

      const t = `${record.username}-token`;
      tokens.set(t, publicUser(record));
      sendJson(response, 200, {
        token: t,
        expiresAt: '2026-09-30T00:00:00.000Z',
        user: publicUser(record),
      });
      return;
    }

    if (url.pathname === '/api/phase5/auth/register') {
      const body = await readJson(request);
      const username = body.username;
      const existing = findUser(username);

      if (existing && existing.status !== 'disabled') {
        sendJson(response, 400, {
          error: 'Phase5ValidationError',
          code: 'PHASE5_VALIDATION_ERROR',
          message: '用户名已被占用',
        });
        return;
      }

      const record = existing || {
        id: ++nextId,
        username,
        role: 'editor',
        displayName: null,
        createdAt: '2026-09-20T01:00:00.000Z',
      };
      record.password = body.password;
      record.status = 'pending';
      record.updatedAt = '2026-09-20T01:00:00.000Z';
      if (!existing) records.push(record);

      sendJson(response, 201, {
        id: record.id,
        username: record.username,
        role: record.role,
        status: 'pending',
      });
      return;
    }

    if (!user) {
      sendJson(response, 401, {
        error: 'Phase5UnauthorizedError',
        code: 'PHASE5_UNAUTHORIZED',
        message: 'authentication required',
      });
      return;
    }

    if (url.pathname === '/api/phase5/auth/me') {
      sendJson(response, 200, user);
      return;
    }

    if (url.pathname === '/api/phase5/auth/logout') {
      sendJson(response, 200, { status: 'logged_out' });
      return;
    }

    if (url.pathname === '/api/phase5/users' && request.method === 'GET') {
      const status = url.searchParams.get('status');
      const list = records
        .filter((record) => !status || record.status === status)
        .map(publicUser);
      sendJson(response, 200, { users: list });
      return;
    }

    const userMatch = url.pathname.match(/^\/api\/phase5\/users\/(\d+)$/);
    if (userMatch && request.method === 'PUT') {
      const record = records.find((r) => r.id === Number(userMatch[1]));
      if (!record) {
        sendJson(response, 404, {
          error: 'Phase5NotFoundError',
          code: 'PHASE5_NOT_FOUND',
          message: 'user not found',
        });
        return;
      }
      const body = await readJson(request);
      if (body.status) record.status = body.status;
      if (body.role) record.role = body.role;
      if (body.displayName !== undefined) record.displayName = body.displayName;
      record.updatedAt = '2026-09-20T02:00:00.000Z';
      sendJson(response, 200, publicUser(record));
      return;
    }

    const resetMatch = url.pathname.match(/^\/api\/phase5\/users\/(\d+)\/password$/);
    if (resetMatch && request.method === 'PUT') {
      const record = records.find((r) => r.id === Number(resetMatch[1]));
      if (!record) {
        sendJson(response, 404, {
          error: 'Phase5NotFoundError',
          code: 'PHASE5_NOT_FOUND',
          message: 'user not found',
        });
        return;
      }
      const body = await readJson(request);
      record.password = body.password;
      sendJson(response, 200, { id: record.id, username: record.username, status: 'updated' });
      return;
    }

    if (url.pathname === '/api/phase5/auth/password' && request.method === 'PUT') {
      const record = records.find((r) => r.id === user.id);
      const body = await readJson(request);
      if (!record || record.password !== body.currentPassword) {
        sendJson(response, 401, {
          error: 'Phase5UnauthorizedError',
          code: 'PHASE5_UNAUTHORIZED',
          message: 'current password is incorrect',
        });
        return;
      }
      record.password = body.newPassword;
      sendJson(response, 200, { status: 'updated' });
      return;
    }

    if (url.pathname === '/api/phase5/sessions') {
      sendJson(response, 200, { sessions: [] });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/api\/phase5\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      sendJson(response, 404, {
        error: 'Phase5NotFoundError',
        code: 'PHASE5_NOT_FOUND',
        message: 'session not found',
      });
      return;
    }

    sendJson(response, 404, {
      error: 'NotFound',
      code: 'PHASE5_NOT_FOUND',
      message: 'route not found',
    });
  });

  return { server, records, tokens };
};

const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'resident-app-e2e-'));
const phase5Mock = createPhase5Mock();
const auditStore = createAuditStore(':memory:');
const visitorQuotaStore = createVisitorQuotaStore({
  databasePath: path.join(rootDirectory, 'quota.sqlite'),
});
const plotAssignmentStore = createPlotAssignmentStore({
  databasePath: path.join(rootDirectory, 'plots.sqlite'),
});
let phase6Server;

try {
  await listen(phase5Mock.server);

  const config = {
    phase5BaseUrl: `http://127.0.0.1:${phase5Mock.server.address().port}`,
    ragBaseUrl: 'http://127.0.0.1:9',
    serviceToken: 'phase6-service-token',
    ragDocsDirectory: path.join(rootDirectory, 'rag-docs'),
    docsDirectory: path.join(rootDirectory, 'rag-docs', 'phase6'),
    maxUploadBytes: 10485760,
    requestTimeoutMs: 5000,
    allowedOrigins: ['http://localhost:5174'],
  };
  const app = createPhase6App({
    config,
    auditStore,
    visitorQuotaStore,
    plotAssignmentStore,
  });
  phase6Server = await listen(http.createServer(app));
  const baseUrl = `http://127.0.0.1:${phase6Server.address().port}`;

  const call = async (p, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${baseUrl}${p}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  };

  const adminLogin = await call('/api/phase6/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin-password' },
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.payload.token;

  // 注册
  const apply = await call('/api/phase6/residents/apply', {
    method: 'POST',
    body: { username: 'zhang_san', password: 'pass123456' },
  });
  assert.equal(apply.status, 201);
  assert.equal(apply.payload.status, 'pending');

  // 待审核不能登录
  const pendingLogin = await call('/api/phase6/auth/login', {
    method: 'POST',
    body: { username: 'zhang_san', password: 'pass123456' },
  });
  assert.equal(pendingLogin.status, 401);

  // 非管理员不能看申请列表（用一个 viewer 身份？mock 只有 admin，直接验证 401 无 token）
  const noAuthList = await call('/api/phase6/resident-applications');
  assert.equal(noAuthList.status, 401);

  // 管理员看申请列表
  const apps = await call('/api/phase6/resident-applications', { token: adminToken });
  assert.equal(apps.status, 200);
  assert.equal(apps.payload.applications.some((a) => a.username === 'zhang_san'), true);

  // 批准
  const approve = await call(`/api/phase6/resident-applications/${apply.payload.id}/approve`, {
    method: 'POST',
    token: adminToken,
    body: { username: 'zhang_san' },
  });
  assert.equal(approve.status, 201);
  assert.ok(approve.payload.plot.plotNumber >= 1);
  assert.equal(approve.payload.resident.homePlotId, `plot-${approve.payload.plot.plotNumber}`);

  // 批准后可登录
  const residentLogin = await call('/api/phase6/auth/login', {
    method: 'POST',
    body: { username: 'zhang_san', password: 'pass123456' },
  });
  assert.equal(residentLogin.status, 200);
  const residentToken = residentLogin.payload.token;

  // 居民访问审核面板 403
  const residentApps = await call('/api/phase6/resident-applications', { token: residentToken });
  assert.equal(residentApps.status, 403);

  // 居民自助改密码
  const chg = await call('/api/phase6/auth/password', {
    method: 'PUT',
    token: residentToken,
    body: { currentPassword: 'pass123456', newPassword: 'newpass456' },
  });
  assert.equal(chg.status, 200);

  // 管理员重置密码
  const reset = await call(`/api/phase6/residents/${apply.payload.id}/reset-password`, {
    method: 'POST',
    token: adminToken,
    body: { password: 'resetpass789' },
  });
  assert.equal(reset.status, 200);

  // 迁出：名额释放 + 宅院释放
  const depart = await call(`/api/phase6/residents/${apply.payload.id}/depart`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(depart.status, 200);
  const plots = await call('/api/phase6/plots', { token: adminToken });
  assert.equal(
    plots.payload.plots.find((p) => p.plotNumber === approve.payload.plot.plotNumber).status,
    'vacant',
  );

  // 驳回 + 重新提交
  const apply2 = await call('/api/phase6/residents/apply', {
    method: 'POST',
    body: { username: 'li_si', password: 'pass123456' },
  });
  assert.equal(apply2.status, 201);
  const reject = await call(`/api/phase6/resident-applications/${apply2.payload.id}/reject`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(reject.status, 200);
  const reapply = await call('/api/phase6/residents/apply', {
    method: 'POST',
    body: { username: 'li_si', password: 'pass654321' },
  });
  assert.equal(reapply.status, 201);

  console.log('resident applications e2e: all passed');
} finally {
  await auditStore.close();
  visitorQuotaStore.close();
  plotAssignmentStore.close();
  if (phase6Server?.listening) await close(phase6Server);
  if (phase5Mock.server.listening) await close(phase5Mock.server);
  await rm(rootDirectory, { recursive: true, force: true });
}
