import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { WebSocket } from 'ws';
import { startModuleAServer } from '../backend/src/server.js';
import { readModuleAConfig } from '../backend/src/config.js';

const users = {
  admin: {
    id: 1,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
    password: 'utopia2026',
  },
  owner: {
    id: 2,
    username: 'owner',
    displayName: '房主',
    role: 'editor',
    password: 'utopia2026',
  },
  friend: {
    id: 4,
    username: 'friend',
    displayName: '好友',
    role: 'editor',
    password: 'utopia2026',
  },
  visitor: {
    id: 3,
    username: 'visitor',
    displayName: '访客',
    role: 'viewer',
    password: 'utopia2026',
  },
};

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
];

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const writeJson = (response, status, payload) => {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
};

const readBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
    : {};
};

const createPhase5Mock = async () => {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (
      request.method === 'POST' &&
      url.pathname === '/api/phase5/auth/login'
    ) {
      const body = await readBody(request);
      const user = users[body.username];

      if (!user || body.password !== user.password) {
        writeJson(response, 401, {
          code: 'PHASE5_UNAUTHORIZED',
          message: 'Invalid credentials',
        });
        return;
      }

      writeJson(response, 200, {
        token: `mock-token-${user.username}`,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      });
      return;
    }

    writeJson(response, 404, {
      code: 'PHASE5_NOT_FOUND',
      message: 'Not found',
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    server,
  };
};

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Timed out waiting for condition');
};

let phase5;
let moduleA;
let viteServer;
let browser;
let realtimeProbe;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'module-a-e2e-'));
  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const authAdapter = {
    authenticate: async (authorization) => {
      const username = String(authorization || '')
        .replace(/^Bearer\s+/, '')
        .replace(/^mock-token-/, '');
      const user = users[username];

      if (!user) {
        const error = new Error('Unauthorized');
        error.code = 'BP4_UNAUTHORIZED';
        error.status = 401;
        throw error;
      }

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      };
    },
  };

  moduleA = await startModuleAServer({
    config: {
      ...readModuleAConfig(),
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'module-a.sqlite'),
      bp3DatabasePath: path.join(temporaryDirectory, 'missing-bp3.sqlite'),
      phase5BaseUrl: phase5.baseUrl,
      allowedOrigins: [
        `http://127.0.0.1:${vitePort}`,
        `http://localhost:${vitePort}`,
      ],
    },
    authAdapter,
  });
  const moduleABaseUrl = `http://127.0.0.1:${moduleA.server.address().port}`;

  process.env.BP4_MODULE_A_PROXY_TARGET = moduleABaseUrl;
  process.env.PHASE5_PROXY_TARGET = phase5.baseUrl;
  viteServer = await createViteServer({
    configFile: path.resolve('frontend/vite.config.js'),
    server: {
      host: '127.0.0.1',
      port: vitePort,
      strictPort: true,
    },
    logLevel: 'error',
  });
  await viteServer.listen();

  const apiRequest = async ({
    token,
    path: requestPath,
    method = 'GET',
    body,
  }) => {
    const response = await fetch(`${moduleABaseUrl}${requestPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  };

  const ticketResponse = await apiRequest({
    token: 'mock-token-admin',
    path: '/api/bp4/module-a/realtime/ticket',
    method: 'POST',
    body: {
      channelIds: ['world-main'],
    },
  });
  const realtimeMessages = [];

  realtimeProbe = new WebSocket(
    `${moduleABaseUrl.replace(/^http/, 'ws')}/ws/bp4/realtime?ticket=${encodeURIComponent(ticketResponse.payload.ticket)}`,
  );
  realtimeProbe.on('message', (raw) => {
    const message = JSON.parse(raw.toString());

    if (message.id) {
      realtimeMessages.push(message);
    }
  });
  await new Promise((resolve, reject) => {
    realtimeProbe.once('open', resolve);
    realtimeProbe.once('error', reject);
  });
  realtimeProbe.send(
    JSON.stringify({
      type: 'subscribe',
      channelId: 'world-main',
    }),
  );

  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
  });
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${vitePort}/`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-home-count]')?.dataset.homeCount === '50',
    null,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-realtime-status]')?.dataset
        .realtimeStatus === 'online',
    null,
    { timeout: 10_000 },
  );

  await page.locator('.ma-home-list button').first().click();
  await page.getByLabel('玩家ID').first().fill('2');
  await page.getByLabel('玩家名称').fill('owner');
  await page.getByRole('button', { name: '绑定房主' }).click();
  await page.getByText('房主绑定已更新').waitFor({ timeout: 5000 });
  await waitFor(() =>
    realtimeMessages.some(
      (message) =>
        message.data?.kind === 'home.ownership.updated' &&
        message.data?.plotId === 'plot-1',
    ),
  );

  await page.getByRole('button', { name: '保存权限' }).click();
  await page.getByText('家园访问权限已更新').waitFor({ timeout: 5000 });

  const ownerViewPrivate = await apiRequest({
    token: 'mock-token-owner',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=view',
  });
  const ownerEditPrivate = await apiRequest({
    token: 'mock-token-owner',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=edit',
  });
  const visitorPrivate = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=view',
  });

  assert.equal(ownerViewPrivate.payload.allowed, true);
  assert.equal(ownerEditPrivate.payload.allowed, true);
  assert.equal(visitorPrivate.payload.allowed, false);

  const friendsUpdate = await apiRequest({
    token: 'mock-token-admin',
    path: '/api/bp4/module-a/homes/plot-1/access',
    method: 'PUT',
    body: {
      accessMode: 'friends',
      friendUserIds: [4],
    },
  });

  assert.equal(friendsUpdate.status, 200);
  const friendView = await apiRequest({
    token: 'mock-token-friend',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=view',
  });
  const friendEdit = await apiRequest({
    token: 'mock-token-friend',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=edit',
  });
  const visitorFriends = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=view',
  });

  assert.equal(friendView.payload.allowed, true);
  assert.equal(friendEdit.payload.allowed, false);
  assert.equal(visitorFriends.payload.allowed, false);

  const publicUpdate = await apiRequest({
    token: 'mock-token-admin',
    path: '/api/bp4/module-a/homes/plot-1/access',
    method: 'PUT',
    body: {
      accessMode: 'public',
      friendUserIds: [4],
    },
  });

  assert.equal(publicUpdate.status, 200);
  const visitorPublicView = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=view',
  });
  const visitorPublicEdit = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-a/homes/plot-1/my-access?action=edit',
  });
  const adminEdit = await apiRequest({
    token: 'mock-token-admin',
    path: '/api/bp4/module-a/homes/plot-1/evaluate',
    method: 'POST',
    body: {
      targetUserId: 1,
      action: 'edit',
    },
  });
  const viewerManagement = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-a/homes/plot-1/access',
    method: 'PUT',
    body: {
      accessMode: 'public',
      friendUserIds: [],
    },
  });

  assert.equal(visitorPublicView.payload.allowed, true);
  assert.equal(visitorPublicEdit.payload.allowed, false);
  assert.equal(adminEdit.payload.allowed, false);
  assert.equal(viewerManagement.status, 403);

  await page.waitForFunction(
    () =>
      document.querySelector('[data-access-mode]')?.dataset.accessMode ===
      'public',
    null,
    { timeout: 5000 },
  );
  await waitFor(
    () =>
      realtimeMessages.filter(
        (message) => message.data?.kind === 'home.access.updated',
      ).length >= 3,
    5000,
  );

  await page.screenshot({
    path: path.resolve('artifacts/module-a-panel.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/module-a-mobile.png'),
  });

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        homes: 50,
        privateAccess: 'owner-only',
        friendsAccess: 'friend-read-only',
        publicAccess: 'visitor-read-only',
        adminEdit: 'denied-without-owner',
        viewerManagement: '403',
        realtimeEvents: realtimeMessages.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  realtimeProbe?.close();
  await viteServer?.close().catch(() => null);
  await moduleA?.close().catch(() => null);
  await closeServer(phase5?.server).catch(() => null);

  if (
    temporaryDirectory &&
    path.resolve(temporaryDirectory).startsWith(path.resolve(os.tmpdir()))
  ) {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    }).catch(() => null);
  }
}
