import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readBp3Config } from '../backend/src/config.js';
import { startBp3Server } from '../backend/src/server.js';

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

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
        userId: user.id,
        sceneId: 'world',
        sessionType: 'private',
        ownerAgentId: 'bp3-e2e',
        title: 'world snapshot',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        messages: [
          {
            role: 'system',
            content: JSON.stringify({
              kind: 'virtual-utopia-world-state',
              version: 1,
              savedAt: new Date().toISOString(),
              snapshot: {
                version: 1,
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
  const payload = await response.json().catch(() => null);

  return {
    status: response.status,
    payload,
  };
};

const loginPage = async (page, username, baseUrl) => {
  await page.goto(baseUrl, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[autocomplete="username"]').fill(username);
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('[data-voice-status]').waitFor({ timeout: 20_000 });
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
let bp3;
let viteServer;
let browser;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'virtual-utopia-bp3-'),
  );
  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const config = {
    ...readBp3Config(),
    host: '127.0.0.1',
    port: 0,
    databasePath: path.join(temporaryDirectory, 'virtual_utopia_bp3.sqlite'),
    phase5BaseUrl: phase5.baseUrl,
    allowedOrigins: [
      `http://127.0.0.1:${vitePort}`,
      `http://localhost:${vitePort}`,
    ],
    mediasoup: {
      ...readBp3Config().mediasoup,
      rtcMinPort: 42000,
      rtcMaxPort: 42200,
    },
  };

  bp3 = await startBp3Server({ config });
  const bp3BaseUrl = `http://127.0.0.1:${bp3.server.address().port}`;

  process.env.BP3_PROXY_TARGET = bp3BaseUrl;
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
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  const adminContext = await browser.newContext({
    permissions: ['microphone'],
    viewport: {
      width: 1440,
      height: 900,
    },
  });
  const travelerContext = await browser.newContext({
    permissions: ['microphone'],
    viewport: {
      width: 1440,
      height: 900,
    },
  });
  const adminPage = await adminContext.newPage();
  const travelerPage = await travelerContext.newPage();
  const worldBaseUrl = `http://127.0.0.1:${vitePort}/`;
  const browserEvents = {
    admin: [],
    traveler: [],
  };

  adminPage.on('console', (message) => {
    browserEvents.admin.push(`console:${message.type()}:${message.text()}`);
  });
  adminPage.on('pageerror', (error) => {
    browserEvents.admin.push(`pageerror:${error.message}`);
  });
  travelerPage.on('console', (message) => {
    browserEvents.traveler.push(`console:${message.type()}:${message.text()}`);
  });
  travelerPage.on('pageerror', (error) => {
    browserEvents.traveler.push(`pageerror:${error.message}`);
  });

  await Promise.all([
    loginPage(adminPage, 'admin', worldBaseUrl),
    loginPage(travelerPage, 'traveler', worldBaseUrl),
  ]);
  await adminPage.locator('.bp3-home-panel').waitFor({ timeout: 20_000 });
  await travelerPage.locator('.bp3-home-panel').waitFor({ timeout: 20_000 });

  await Promise.all([
    adminPage.getByRole('button', { name: '加入语音' }).click(),
    travelerPage.getByRole('button', { name: '加入语音' }).click(),
  ]);
  try {
    await Promise.all([
      adminPage.waitForFunction(
        () =>
          document.querySelector('[data-voice-status]')?.dataset.voiceStatus ===
          'connected',
        null,
        { timeout: 20_000 },
      ),
      travelerPage.waitForFunction(
        () =>
          document.querySelector('[data-voice-status]')?.dataset.voiceStatus ===
          'connected',
        null,
        { timeout: 20_000 },
      ),
    ]);
  } catch (error) {
    const debug = {
      admin: await adminPage.evaluate(() => ({
        status: document.querySelector('[data-voice-status]')?.dataset
          .voiceStatus,
        text: document.querySelector('.bp3-voice-panel')?.innerText,
      })),
      traveler: await travelerPage.evaluate(() => ({
        status: document.querySelector('[data-voice-status]')?.dataset
          .voiceStatus,
        text: document.querySelector('.bp3-voice-panel')?.innerText,
      })),
      browserEvents,
    };

    console.error(JSON.stringify(debug, null, 2));
    throw error;
  }
  try {
    await Promise.all([
      adminPage.waitForFunction(
        () =>
          Number(
            document.querySelector('[data-remote-audio-count]')?.dataset
              .remoteAudioCount || 0,
          ) >= 1,
        null,
        { timeout: 20_000 },
      ),
      travelerPage.waitForFunction(
        () =>
          Number(
            document.querySelector('[data-remote-audio-count]')?.dataset
              .remoteAudioCount || 0,
          ) >= 1,
        null,
        { timeout: 20_000 },
      ),
    ]);
  } catch (error) {
    const debug = {
      admin: await adminPage.evaluate(() => ({
        remoteAudioCount: document.querySelector('[data-remote-audio-count]')
          ?.dataset.remoteAudioCount,
        text: document.querySelector('.bp3-voice-panel')?.innerText,
      })),
      traveler: await travelerPage.evaluate(() => ({
        remoteAudioCount: document.querySelector('[data-remote-audio-count]')
          ?.dataset.remoteAudioCount,
        text: document.querySelector('.bp3-voice-panel')?.innerText,
      })),
      browserEvents,
    };

    console.error(JSON.stringify(debug, null, 2));
    throw error;
  }

  const participants = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/voice/channels/world-main/participants',
    token: 'mock-token-admin',
  });
  assert.equal(participants.status, 200);
  assert.equal(participants.payload.participants.length, 2);

  const viewerModeration = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/voice/channels/world-main/moderate',
    token: 'mock-token-viewer',
    method: 'POST',
    body: {
      targetUserId: 2,
      action: 'kick',
    },
  });
  assert.equal(viewerModeration.status, 403);

  const viewerHomeUpdate = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-3/access',
    token: 'mock-token-viewer',
    method: 'PUT',
    body: {
      accessMode: 'private',
    },
  });
  assert.equal(viewerHomeUpdate.status, 403);

  await adminPage
    .getByRole('button', {
      name: '申请',
      exact: true,
    })
    .click();
  const lockButton = adminPage.getByRole('button', {
    name: '上锁',
  });

  if (await lockButton.isVisible()) {
    await lockButton.click();
  }

  await travelerPage.getByRole('button', { name: '访客申请' }).click();
  await travelerPage.getByPlaceholder('plot-12').fill('plot-1');
  await travelerPage.getByPlaceholder('希望访问您的家园').fill('E2E 访问申请');
  await travelerPage.getByRole('button', { name: '提交申请' }).click();
  await travelerPage.getByText(/申请已提交/).waitFor({ timeout: 10_000 });
  await travelerPage
    .getByRole('button', {
      name: '关闭',
    })
    .click();

  await adminPage
    .locator('.bp3-home-panel')
    .getByRole('button', { name: '刷新' })
    .click();
  await adminPage.getByText('E2E 访问申请').waitFor({ timeout: 10_000 });
  await adminPage.getByRole('button', { name: '同意' }).click();

  const approvedAccess = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-1/access-check',
    token: 'mock-token-traveler',
    method: 'POST',
    body: {
      consumeGrant: true,
    },
  });
  assert.equal(approvedAccess.status, 200);
  assert.equal(approvedAccess.payload.allowed, true);
  assert.equal(approvedAccess.payload.reason, 'grant');

  const consumedAccess = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-1/access-check',
    token: 'mock-token-traveler',
    method: 'POST',
    body: {
      consumeGrant: true,
    },
  });
  assert.equal(consumedAccess.payload.allowed, false);

  await adminPage.getByRole('button', { name: '开门' }).click();
  const unlockedAccess = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-1/access-check',
    token: 'mock-token-traveler',
    method: 'POST',
    body: {
      consumeGrant: false,
    },
  });
  assert.equal(unlockedAccess.payload.allowed, true);
  assert.equal(unlockedAccess.payload.reason, 'door_unlocked');

  const inviteResult = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-1/invites',
    token: 'mock-token-admin',
    method: 'POST',
    body: {
      expiresInSeconds: 3600,
      maxUses: 1,
    },
  });
  assert.equal(inviteResult.status, 201);

  const redeemResult = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: `/api/bp3/invites/${encodeURIComponent(
      inviteResult.payload.token,
    )}/redeem`,
    token: 'mock-token-viewer',
    method: 'POST',
  });
  assert.equal(redeemResult.status, 200);
  assert.equal(redeemResult.payload.plotId, 'plot-1');

  const viewerAccess = await apiRequest({
    baseUrl: bp3BaseUrl,
    path: '/api/bp3/homes/plot-1/access-check',
    token: 'mock-token-viewer',
    method: 'POST',
    body: {
      consumeGrant: true,
    },
  });
  assert.equal(viewerAccess.payload.allowed, true);

  await adminPage.screenshot({
    path: path.resolve('artifacts/bp3-admin.png'),
  });
  await travelerPage.screenshot({
    path: path.resolve('artifacts/bp3-traveler.png'),
  });

  const mobileContext = await browser.newContext({
    permissions: ['microphone'],
    viewport: {
      width: 390,
      height: 844,
    },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();

  await loginPage(mobilePage, 'viewer', worldBaseUrl);
  await mobilePage.locator('.bp3-home-panel').waitFor({ timeout: 20_000 });
  await mobilePage.screenshot({
    path: path.resolve('artifacts/bp3-mobile.png'),
  });
  await mobileContext.close();

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        voice: {
          connectedUsers: 2,
          remoteAudioTracks: 2,
        },
        permissions: {
          viewerModeration: 'blocked',
          approval: 'passed',
          oneTimeGrant: 'consumed',
          doorUnlock: 'passed',
          inviteRedemption: 'passed',
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  await viteServer?.close().catch(() => null);
  await bp3?.close().catch(() => null);
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
