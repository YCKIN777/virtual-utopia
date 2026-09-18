import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { startP1Server } from '../backend/src/server.js';
import { readP1Config } from '../backend/src/config.js';

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
let p1;
let viteServer;
let browser;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'virtual-utopia-bp3-p1-'),
  );
  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const config = {
    ...readP1Config(),
    host: '127.0.0.1',
    port: 0,
    databasePath: path.join(temporaryDirectory, 'virtual_utopia_bp3.sqlite'),
    phase5BaseUrl: phase5.baseUrl,
    ownerResolutionEnabled: false,
    allowedOrigins: [
      `http://127.0.0.1:${vitePort}`,
      `http://localhost:${vitePort}`,
    ],
  };

  p1 = await startP1Server({ config });
  const p1BaseUrl = `http://127.0.0.1:${p1.server.address().port}`;
  const adminToken = 'mock-token-admin';
  const travelerToken = 'mock-token-traveler';

  const event = await apiRequest({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/events',
    token: adminToken,
    method: 'POST',
    body: {
      title: '山麓采集季',
      description: '收集木材，完成聚落任务。',
      status: 'draft',
    },
  });
  assert.equal(event.status, 201);

  const task = await apiRequest({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/tasks',
    token: adminToken,
    method: 'POST',
    body: {
      eventId: event.payload.event.id,
      title: '整理木料',
      description: '收集三份木材。',
      targetItemId: 'wood',
      targetQuantity: 3,
      rewardItems: [
        {
          itemId: 'stone',
          quantity: 1,
        },
      ],
      rewardShards: 2,
    },
  });
  assert.equal(task.status, 201);

  for (const node of [
    {
      name: '林地木料',
      x: 0,
      y: 0,
      z: 0,
    },
    {
      name: '河岸木料',
      x: 1,
      y: 0,
      z: 1,
    },
  ]) {
    const resource = await apiRequest({
      baseUrl: p1BaseUrl,
      path: '/api/bp3/p1/resources',
      token: adminToken,
      method: 'POST',
      body: {
        ...node,
        itemId: 'wood',
        quantity: 2,
        interactionRadius: 5,
        respawnSeconds: 60,
      },
    });
    assert.equal(resource.status, 201);
  }

  process.env.BP3_P1_PROXY_TARGET = p1BaseUrl;
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

  await page.goto(`http://127.0.0.1:${vitePort}/p1.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[autocomplete="username"]').fill('traveler');
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('[data-resource-count]').waitFor({
    state: 'attached',
    timeout: 20_000,
  });
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-resource-count]')?.dataset
          .resourceCount || 0,
      ) === 2,
    null,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => document.querySelector('[data-p1-ready]')?.dataset.p1Ready === 'true',
    null,
    { timeout: 15_000 },
  );

  const activated = await apiRequest({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/events/${encodeURIComponent(
      event.payload.event.id,
    )}/activate`,
    token: adminToken,
    method: 'POST',
  });
  assert.equal(activated.status, 200);
  await page
    .getByRole('dialog', { name: '世界事件' })
    .waitFor({ timeout: 10_000 });
  await page.getByRole('heading', { name: '山麓采集季' }).waitFor();
  await page.getByRole('button', { name: '知道了' }).click();

  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByText('整理木料').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: '领取任务' }).click();

  await page.locator('[data-nearby-resource]').waitFor({ timeout: 10_000 });
  await page.locator('[data-nearby-resource]').click();
  await page.waitForTimeout(900);
  await page.locator('[data-nearby-resource]').waitFor({ timeout: 10_000 });
  await page.locator('[data-nearby-resource]').click();
  await page.waitForTimeout(1200);

  const completedTasks = await apiRequest({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/tasks',
    token: travelerToken,
  });
  const completedTask = completedTasks.payload.tasks.find(
    (candidate) => candidate.id === task.payload.task.id,
  );

  assert.equal(completedTask.instance.status, 'completed');
  await page.getByRole('button', { name: '领取奖励' }).click();
  await page.waitForTimeout(800);

  const duplicateClaim = await apiRequest({
    baseUrl: p1BaseUrl,
    path: `/api/bp3/p1/tasks/${encodeURIComponent(task.payload.task.id)}/claim`,
    token: travelerToken,
    method: 'POST',
  });
  assert.equal(duplicateClaim.status, 200);
  assert.equal(duplicateClaim.payload.alreadyClaimed, true);

  const inventoryAfterReward = await apiRequest({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/inventory',
    token: travelerToken,
  });
  const stone = inventoryAfterReward.payload.inventory.items.find(
    (item) => item.itemId === 'stone',
  );
  assert.equal(stone.quantity, 1);

  await page.getByRole('button', { name: '背包', exact: true }).click();
  await page.getByText('木材').waitFor({ timeout: 10_000 });
  await page.getByText('石块').waitFor();

  const grant = await apiRequest({
    baseUrl: p1BaseUrl,
    path: '/api/bp3/p1/inventory/grant',
    token: adminToken,
    method: 'POST',
    body: {
      targetUserId: 2,
      itemId: 'crystal',
      quantity: 1,
      reason: 'e2e_grant',
      idempotencyKey: 'e2e-crystal-1',
    },
  });
  assert.equal(grant.status, 200);
  assert.equal(grant.payload.item.quantity, 1);

  const concurrentConsumes = await Promise.all([
    apiRequest({
      baseUrl: p1BaseUrl,
      path: '/api/bp3/p1/inventory/consume',
      token: travelerToken,
      method: 'POST',
      body: {
        itemId: 'crystal',
        quantity: 1,
      },
    }),
    apiRequest({
      baseUrl: p1BaseUrl,
      path: '/api/bp3/p1/inventory/consume',
      token: travelerToken,
      method: 'POST',
      body: {
        itemId: 'crystal',
        quantity: 1,
      },
    }),
  ]);
  const statuses = concurrentConsumes
    .map((result) => result.status)
    .sort((left, right) => left - right);

  assert.deepEqual(statuses, [200, 409]);

  await page.screenshot({
    path: path.resolve('artifacts/bp3-m2-world.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/bp3-m2-mobile.png'),
  });

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        eventTrigger: 'passed',
        taskAcceptAndComplete: 'passed',
        resourcePickup: 'passed',
        inventoryAddConsume: 'passed',
        rewardGrant: 'passed',
        duplicateReward: 'blocked',
        inventoryConcurrency: statuses,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  await viteServer?.close().catch(() => null);
  await p1?.close().catch(() => null);
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
