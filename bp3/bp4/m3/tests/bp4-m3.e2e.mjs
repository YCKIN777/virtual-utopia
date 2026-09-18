import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { startM1Server } from '../../m1/backend/src/server.js';
import { readM1Config } from '../../m1/backend/src/config.js';
import { startM2Server } from '../../m2/backend/src/server.js';
import { readM2Config } from '../../m2/backend/src/config.js';
import { startM3Server } from '../backend/src/server.js';
import { readM3Config } from '../backend/src/config.js';

const users = {
  admin: {
    id: 1,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
    password: 'utopia2026',
  },
  viewer: {
    id: 3,
    username: 'viewer',
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

const apiRequest = async ({
  baseUrl,
  path: requestPath,
  token,
  method = 'GET',
  body,
}) => {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: response.status,
    payload: await response.json().catch(() => null),
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

let phase5;
let m1;
let m2;
let m3;
let viteServer;
let browser;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m3-e2e-'));
  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const turnPort = await getFreePort();
  const ticketSecret = 'bp4-m3-e2e-shared-secret';
  const authAdapter = {
    authenticate: async (authorization) => {
      const username = String(authorization || '')
        .replace(/^Bearer\s+/, '')
        .replace(/^mock-token-/, '');
      const user =
        users[username] ||
        (username === 'bp4-m1-e2e-user'
          ? {
              id: 8,
              username: 'traveler',
              displayName: '漫游者',
              role: 'editor',
            }
          : null);

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

  m1 = await startM1Server({
    config: {
      ...readM1Config(),
      host: '127.0.0.1',
      port: 0,
      ticketSecret,
    },
    authAdapter,
  });
  m2 = await startM2Server({
    config: {
      ...readM2Config(),
      host: '127.0.0.1',
      port: 0,
      ticketSecret,
      cluster: {
        ...readM2Config().cluster,
        workers: 1,
        rtcMinPort: 48000,
        rtcMaxPort: 48100,
      },
      turn: {
        ...readM2Config().turn,
        listeningPort: turnPort,
        relayMinPort: 49400,
        relayMaxPort: 49500,
        username: 'e2e',
        password: 'e2e-secret',
      },
    },
    authAdapter,
  });
  const m1BaseUrl = `http://127.0.0.1:${m1.realtime.server.address().port}`;
  const m2BaseUrl = `http://127.0.0.1:${m2.realtime.server.address().port}`;

  m3 = await startM3Server({
    config: {
      ...readM3Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'bp4_m3.sqlite'),
      ticketSecret,
      m1BaseUrl,
      m2BaseUrl,
      phase5BaseUrl: phase5.baseUrl,
      pollIntervalMs: 500,
      allowedOrigins: [
        `http://127.0.0.1:${vitePort}`,
        `http://localhost:${vitePort}`,
      ],
    },
    authAdapter,
  });
  const m3BaseUrl = `http://127.0.0.1:${m3.server.address().port}`;
  const adminToken = 'mock-token-admin';
  const viewerToken = 'mock-token-viewer';

  await new Promise((resolve) => setTimeout(resolve, 1200));
  const viewerWorld = await apiRequest({
    baseUrl: m3BaseUrl,
    path: '/api/bp4/m3/worlds',
    token: viewerToken,
    method: 'POST',
    body: {
      id: 'forbidden-world',
      name: 'Forbidden',
      region: 'test',
      capacity: 10,
    },
  });

  assert.equal(viewerWorld.status, 403);
  const roleGrant = await apiRequest({
    baseUrl: m3BaseUrl,
    path: '/api/bp4/m3/accounts/3/role',
    token: adminToken,
    method: 'PUT',
    body: {
      opsRole: 'operator',
    },
  });
  assert.equal(roleGrant.status, 200);
  const promotedWorld = await apiRequest({
    baseUrl: m3BaseUrl,
    path: '/api/bp4/m3/worlds',
    token: viewerToken,
    method: 'POST',
    body: {
      id: 'viewer-world',
      name: '访客运营世界',
      region: 'test',
      capacity: 20,
    },
  });
  assert.equal(promotedWorld.status, 201);

  m1.realtime.hub.publish({
    channelId: 'world-main',
    type: 'presence.updated',
    data: {
      users: [
        {
          userId: 7,
          username: 'traveler',
          displayName: '漫游者',
          role: 'editor',
        },
      ],
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 600));

  process.env.BP4_M3_PROXY_TARGET = m3BaseUrl;
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
  await page.locator('.m3-shell').waitFor({ timeout: 20_000 });

  await page.getByRole('button', { name: '世界实例', exact: true }).click();
  await page.getByRole('button', { name: '创建世界' }).click();
  await page.getByText('world-main').waitFor();
  await page.getByRole('button', { name: '家园实例', exact: true }).click();
  await page.getByRole('button', { name: '创建家园' }).click();
  await page.getByText('plot-51').waitFor();
  await page.getByRole('button', { name: '玩家状态', exact: true }).click();
  await page.getByText('漫游者').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '集成监控', exact: true }).click();
  await page.waitForFunction(
    () => document.body.innerText.includes('正常'),
    null,
    { timeout: 10_000 },
  );
  await page.screenshot({
    path: path.resolve('artifacts/bp4-m3-admin.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/bp4-m3-mobile.png'),
  });

  const integrations = await apiRequest({
    baseUrl: m3BaseUrl,
    path: '/api/bp4/m3/integrations',
    token: adminToken,
  });
  const players = await apiRequest({
    baseUrl: m3BaseUrl,
    path: '/api/bp4/m3/players',
    token: adminToken,
  });

  assert.equal(integrations.payload.m1.connected, true);
  assert.equal(integrations.payload.m2.available, true);
  assert.equal(players.payload.players.length, 1);
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        adminShell: 'passed',
        worldManagement: 'passed',
        homeManagement: 'passed',
        playerStatus: players.payload.players.length,
        m1Realtime: integrations.payload.m1.connected,
        m2Metrics: integrations.payload.m2.available,
        viewerWriteBlocked: viewerWorld.status,
        accountRoleGrant: roleGrant.payload.grant.opsRole,
        promotedWorld: promotedWorld.payload.world.id,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  await viteServer?.close().catch(() => null);
  await m3?.close().catch(() => null);
  await m2?.close().catch(() => null);
  await m1?.close().catch(() => null);
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
