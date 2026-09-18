import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { startBp3Server } from '../../backend/src/server.js';
import { readBp3Config } from '../../backend/src/config.js';
import { startP1Server } from '../../p1/backend/src/server.js';
import { readP1Config } from '../../p1/backend/src/config.js';
import { startP2Server } from '../backend/src/server.js';
import { readP2Config } from '../backend/src/config.js';

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
];

const users = {
  admin: {
    id: 1,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
    password: 'utopia2026',
    plotId: 'plot-1',
  },
  traveler: {
    id: 2,
    username: 'traveler',
    displayName: '漫游者',
    role: 'editor',
    password: 'utopia2026',
    plotId: 'plot-2',
  },
  viewer: {
    id: 3,
    username: 'viewer',
    displayName: '访客',
    role: 'viewer',
    password: 'utopia2026',
    plotId: 'plot-3',
  },
};

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
          message: 'Invalid username or password',
        });
        return;
      }

      writeJson(response, 200, {
        token: `mock-token-${user.username}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
      });
      return;
    }

    const authorization = request.headers.authorization || '';
    const username = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).replace(/^mock-token-/, '')
      : '';
    const user = users[username];

    if (!user) {
      writeJson(response, 401, {
        code: 'PHASE5_UNAUTHORIZED',
        message: 'Unauthorized',
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/phase5/auth/me') {
      writeJson(response, 200, {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      url.pathname === `/api/phase5/sessions/world-${user.id}`
    ) {
      writeJson(response, 200, {
        id: `world-${user.id}`,
        messages: [
          {
            role: 'system',
            content: JSON.stringify({
              kind: 'virtual-utopia-world-state',
              snapshot: {
                plotId: user.plotId,
                courtyardItems: [],
                interiorFurniture: [],
                permissions: {
                  role: user.role,
                  canManageHome: user.role !== 'viewer',
                },
              },
            }),
          },
        ],
      });
      return;
    }

    writeJson(response, 404, {
      code: 'PHASE5_NOT_FOUND',
      message: 'Route not found',
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    server,
  };
};

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

const requestJson = async ({
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
let p0;
let p1;
let p2;
let viteServer;
let browser;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'virtual-utopia-bp3-m3-'),
  );
  phase5 = await createPhase5Mock();
  const databasePath = path.join(
    temporaryDirectory,
    'virtual_utopia_bp3.sqlite',
  );
  const allowedOrigins = [];
  const vitePort = await getFreePort();

  allowedOrigins.push(
    `http://127.0.0.1:${vitePort}`,
    `http://localhost:${vitePort}`,
  );

  p0 = await startBp3Server({
    config: {
      ...readBp3Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath,
      phase5BaseUrl: phase5.baseUrl,
      ownerResolutionEnabled: false,
      allowedOrigins,
      mediasoup: {
        ...readBp3Config().mediasoup,
        rtcMinPort: 43000,
        rtcMaxPort: 43200,
      },
    },
  });
  p1 = await startP1Server({
    config: {
      ...readP1Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath,
      phase5BaseUrl: phase5.baseUrl,
      ownerResolutionEnabled: false,
      allowedOrigins,
    },
  });
  p2 = await startP2Server({
    config: {
      ...readP2Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath,
      phase5BaseUrl: phase5.baseUrl,
      ownerResolutionEnabled: false,
      allowedOrigins,
    },
  });

  const p0BaseUrl = `http://127.0.0.1:${p0.server.address().port}`;
  const p1BaseUrl = `http://127.0.0.1:${p1.server.address().port}`;
  const p2BaseUrl = `http://127.0.0.1:${p2.server.address().port}`;
  const adminToken = 'mock-token-admin';
  const travelerToken = 'mock-token-traveler';
  const viewerToken = 'mock-token-viewer';

  const p0Health = await requestJson({
    baseUrl: p0BaseUrl,
    path: '/api/bp3/health',
    token: adminToken,
  });
  assert.equal(p0Health.status, 200);
  assert.equal(p0Health.payload.status, 'ok');

  const p0Join = await requestJson({
    baseUrl: p0BaseUrl,
    path: '/api/bp3/voice/channels/world-main/join',
    token: travelerToken,
    method: 'POST',
  });
  assert.equal(p0Join.status, 200);
  assert.equal(p0Join.payload.channel.id, 'world-main');

  const event = await requestJson({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/events',
    token: adminToken,
    method: 'POST',
    body: {
      title: 'M3联调采集',
      description: '验证事件、任务、资源与背包链路。',
      status: 'draft',
    },
  });
  await requestJson({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/events/${encodeURIComponent(
      event.payload.event.id,
    )}/activate`,
    token: adminToken,
    method: 'POST',
  });
  const task = await requestJson({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/tasks',
    token: adminToken,
    method: 'POST',
    body: {
      eventId: event.payload.event.id,
      title: '联调木材',
      description: '采集木材。',
      targetItemId: 'wood',
      targetQuantity: 2,
      rewardItems: [
        {
          itemId: 'stone',
          quantity: 1,
        },
      ],
    },
  });
  const resource = await requestJson({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/resources',
    token: adminToken,
    method: 'POST',
    body: {
      name: '联调木料',
      itemId: 'wood',
      quantity: 2,
      x: 0,
      y: 0,
      z: 0,
      interactionRadius: 5,
      respawnSeconds: 30,
    },
  });
  await requestJson({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/tasks/${encodeURIComponent(
      task.payload.task.id,
    )}/accept`,
    token: travelerToken,
    method: 'POST',
  });
  const collection = await requestJson({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/resources/${encodeURIComponent(
      resource.payload.resource.id,
    )}/collect`,
    token: travelerToken,
    method: 'POST',
    body: {
      position: { x: 0, y: 0, z: 0 },
    },
  });
  assert.equal(collection.status, 200);
  const claimed = await requestJson({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/tasks/${encodeURIComponent(task.payload.task.id)}/claim`,
    token: travelerToken,
    method: 'POST',
  });
  assert.equal(claimed.status, 200);

  const avatarUpdate = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/avatar/state',
    token: travelerToken,
    method: 'PUT',
    body: {
      actionId: 'wave',
      emoteId: 'happy',
    },
  });
  assert.equal(avatarUpdate.status, 200);
  assert.equal(avatarUpdate.payload.state.actionId, 'wave');

  const avatarSync = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/avatar/states?userIds=1,2,3',
    token: adminToken,
  });
  assert.equal(avatarSync.status, 200);
  assert.ok(
    avatarSync.payload.states.some(
      (state) =>
        state.userId === 2 &&
        state.actionId === 'wave' &&
        state.emoteId === 'happy',
    ),
  );

  const adminMessage = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/homes/plot-1/messages',
    token: adminToken,
    method: 'POST',
    body: {
      content: 'M3全链路验收留言',
    },
  });
  assert.equal(adminMessage.status, 201);
  const forgedMessage = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/homes/plot-1/messages',
    token: travelerToken,
    method: 'POST',
    body: {
      authorUserId: 1,
      content: '伪造作者字段不应生效',
    },
  });
  assert.equal(forgedMessage.status, 201);
  assert.equal(forgedMessage.payload.message.authorUserId, 2);

  const viewerDelete = await requestJson({
    baseUrl: p2BaseUrl,
    path: `/api/bp3/p2/homes/plot-1/messages/${encodeURIComponent(
      adminMessage.payload.message.id,
    )}`,
    token: viewerToken,
    method: 'DELETE',
  });
  assert.equal(viewerDelete.status, 403);

  const ownerDelete = await requestJson({
    baseUrl: p2BaseUrl,
    path: `/api/bp3/p2/homes/plot-1/messages/${encodeURIComponent(
      adminMessage.payload.message.id,
    )}`,
    token: adminToken,
    method: 'DELETE',
  });
  assert.equal(ownerDelete.status, 200);

  const privateRule = await requestJson({
    baseUrl: p0BaseUrl,
    path: '/api/bp3/homes/plot-2/access',
    token: adminToken,
    method: 'PUT',
    body: {
      accessMode: 'private',
      lockEnabled: true,
    },
  });
  assert.equal(privateRule.status, 200);
  const privateMessages = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/homes/plot-2/messages',
    token: viewerToken,
  });
  assert.equal(privateMessages.status, 403);

  const performanceStartedAt = Date.now();
  const performanceResults = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      requestJson({
        baseUrl: p2BaseUrl,
        path: '/api/bp3/p2/avatar/state',
        token: travelerToken,
        method: 'PUT',
        body: {
          actionId: index % 2 ? 'clap' : 'wave',
          emoteId: index % 3 ? 'happy' : null,
        },
      }),
    ),
  );
  const performanceDurationMs = Date.now() - performanceStartedAt;

  assert.ok(performanceResults.every((result) => result.status === 200));
  assert.ok(
    performanceDurationMs < 8000,
    `avatar sync performance exceeded threshold: ${performanceDurationMs}ms`,
  );

  const compatibility = await requestJson({
    baseUrl: p2BaseUrl,
    path: '/api/bp3/p2/health',
    token: adminToken,
  });
  assert.equal(compatibility.status, 200);
  assert.ok(
    compatibility.payload.compatibility.m1Tables.length >= 3,
    JSON.stringify(compatibility.payload.compatibility),
  );
  assert.ok(compatibility.payload.compatibility.m2Tables.length >= 2);
  assert.ok(compatibility.payload.compatibility.p2Tables.length >= 2);

  process.env.BP3_P2_PROXY_TARGET = p2BaseUrl;
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

  await page.goto(`http://127.0.0.1:${vitePort}/p2.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[autocomplete="username"]').fill('traveler');
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('[data-avatar-state]').waitFor({
    state: 'attached',
    timeout: 20_000,
  });
  await page.getByRole('button', { name: '动作', exact: true }).click();
  await page.getByRole('button', { name: '挥手' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-avatar-state]')?.dataset.avatarState ===
      'wave',
    null,
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: /留言/ }).click();
  await page.getByPlaceholder('写下留言').fill('浏览器端M3留言');
  await page.getByRole('button', { name: '发布留言' }).click();
  await page.getByText('浏览器端M3留言').waitFor({ timeout: 10_000 });
  await page.screenshot({
    path: path.resolve('artifacts/bp3-m3-world.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/bp3-m3-mobile.png'),
  });

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        chain: {
          p0VoiceJoin: 'passed',
          p1EventTaskInventory: 'passed',
          p2AvatarMessage: 'passed',
        },
        security: {
          forgedAuthorIgnored: 'passed',
          viewerDeleteBlocked: 'passed',
          privateMessageBlocked: 'passed',
        },
        performance: {
          concurrentAvatarUpdates: performanceResults.length,
          durationMs: performanceDurationMs,
        },
        compatibility: compatibility.payload.compatibility,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  await viteServer?.close().catch(() => null);
  await p2?.close().catch(() => null);
  await p1?.close().catch(() => null);
  await p0?.close().catch(() => null);
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
