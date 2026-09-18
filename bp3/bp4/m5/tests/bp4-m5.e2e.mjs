import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { WebSocket } from 'ws';
import { startM1Server } from '../../m1/backend/src/server.js';
import { readM1Config } from '../../m1/backend/src/config.js';
import { startM5Server } from '../backend/src/server.js';
import { readM5Config } from '../backend/src/config.js';

const users = {
  admin: {
    id: 1,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
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

let phase5;
let m1;
let m5;
let viteServer;
let browser;
let realtimeProbe;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m5-e2e-'));
  const bp3Path = path.join(temporaryDirectory, 'bp3.sqlite');
  const bp3 = new DatabaseSync(bp3Path);

  bp3.exec(`
    CREATE TABLE bp3_plot_owners (
      plot_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL
    );
    INSERT INTO bp3_plot_owners VALUES ('plot-1', 1);
  `);
  bp3.close();

  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const ticketSecret = 'bp4-m5-e2e-secret';
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

  m1 = await startM1Server({
    config: {
      ...readM1Config(),
      host: '127.0.0.1',
      port: 0,
      ticketSecret,
    },
    authAdapter,
  });
  const m1BaseUrl = `http://127.0.0.1:${m1.realtime.server.address().port}`;

  m5 = await startM5Server({
    config: {
      ...readM5Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'bp4_m5.sqlite'),
      bp3DatabasePath: bp3Path,
      ticketSecret,
      m1BaseUrl,
      phase5BaseUrl: phase5.baseUrl,
      allowedOrigins: [
        `http://127.0.0.1:${vitePort}`,
        `http://localhost:${vitePort}`,
      ],
    },
    authAdapter,
  });
  const m5BaseUrl = `http://127.0.0.1:${m5.server.address().port}`;

  await new Promise((resolve) => setTimeout(resolve, 800));

  process.env.BP4_M5_PROXY_TARGET = m5BaseUrl;
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
  await page.locator('[data-selected-plot]').waitFor({
    state: 'attached',
    timeout: 20_000,
  });
  await page.locator('.m5-plot-grid button').first().click();
  await page.getByRole('button', { name: '开始搭建' }).click();
  const paletteItem = page.locator('.m5-palette button').first();
  const targetCell = page.locator('[data-grid-x="1"][data-grid-y="1"]');

  await paletteItem.dragTo(targetCell);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-placed-items]')?.dataset.placedItems ===
      '1',
    null,
    { timeout: 5000 },
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText(/家园已保存/).waitFor({ timeout: 5000 });

  m1.realtime.hub.publish({
    channelId: 'world-main',
    type: 'presence.updated',
    data: {
      users: [
        {
          userId: 1,
          username: 'admin',
          displayName: '管理员',
          role: 'admin',
        },
      ],
    },
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-online-count]')?.dataset.onlineCount ===
      '1',
    null,
    { timeout: 5000 },
  );

  const ticketResponse = await fetch(
    `${m5BaseUrl}/api/bp4/m5/realtime/ticket`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelIds: ['world-main'],
      }),
    },
  );
  const ticket = await ticketResponse.json();

  realtimeProbe = new WebSocket(
    `${m5BaseUrl.replace(/^http/, 'ws')}/ws/bp4/m5/realtime?ticket=${encodeURIComponent(ticket.ticket)}`,
  );
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
  realtimeProbe.send(
    JSON.stringify({
      type: 'avatar.state.updated',
      channelId: 'world-main',
      data: {
        id: 'remote-avatar-e2e',
        displayName: '测试漫游者',
        x: 6,
        y: 2,
        z: -7,
        rotation: 0.8,
        animationState: 'walk',
      },
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-remote-avatars]')?.dataset.remoteAvatars ===
      '1',
    null,
    { timeout: 5000 },
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-selected-plot]').waitFor({
    state: 'attached',
    timeout: 20_000,
  });
  await page.getByRole('button', { name: '开始搭建' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-placed-items]')?.dataset.placedItems ===
      '1',
    null,
    { timeout: 5000 },
  );

  await page.screenshot({
    path: path.resolve('artifacts/bp4-m5-world.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/bp4-m5-mobile.png'),
  });

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        plotCount: await page.locator('.m5-plot-grid button').count(),
        placedItems: 1,
        persistedAfterReload: true,
        playerPresence: 1,
        realtimeStatus: await page
          .locator('[data-realtime-status]')
          .getAttribute('data-realtime-status'),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  realtimeProbe?.close();
  await viteServer?.close().catch(() => null);
  await m5?.close().catch(() => null);
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
