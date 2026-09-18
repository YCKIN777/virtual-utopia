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
import { startM4Server } from '../backend/src/server.js';
import { readM4Config } from '../backend/src/config.js';

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
let m4;
let viteServer;
let browser;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'bp4-m4-e2e-'));
  phase5 = await createPhase5Mock();
  const vitePort = await getFreePort();
  const turnPort = await getFreePort();
  const ticketSecret = 'bp4-m4-e2e-shared-secret';
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
  m2 = await startM2Server({
    config: {
      ...readM2Config(),
      host: '127.0.0.1',
      port: 0,
      ticketSecret,
      cluster: {
        ...readM2Config().cluster,
        workers: 1,
        rtcMinPort: 48200,
        rtcMaxPort: 48300,
      },
      turn: {
        ...readM2Config().turn,
        listeningPort: turnPort,
        relayMinPort: 49600,
        relayMaxPort: 49700,
        username: 'e2e',
        password: 'e2e-secret',
      },
    },
    authAdapter,
  });
  const m1BaseUrl = `http://127.0.0.1:${m1.realtime.server.address().port}`;
  const m2BaseUrl = `http://127.0.0.1:${m2.realtime.server.address().port}`;

  m4 = await startM4Server({
    config: {
      ...readM4Config(),
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'bp4_m4.sqlite'),
      phase5BaseUrl: phase5.baseUrl,
      m1BaseUrl,
      m2BaseUrl,
      metricsIntervalMs: 500,
      allowedOrigins: [
        `http://127.0.0.1:${vitePort}`,
        `http://localhost:${vitePort}`,
      ],
    },
    authAdapter,
  });
  const m4BaseUrl = `http://127.0.0.1:${m4.server.address().port}`;
  const viewerCreate = await apiRequest({
    baseUrl: m4BaseUrl,
    path: '/api/bp4/m4/templates',
    token: 'mock-token-viewer',
    method: 'POST',
    body: {
      id: 'forbidden-template',
      templateType: 'home',
      name: 'Forbidden',
      description: 'Forbidden',
    },
  });

  assert.equal(viewerCreate.status, 403);
  const directTemplate = await apiRequest({
    baseUrl: m4BaseUrl,
    path: '/api/bp4/m4/templates',
    token: 'mock-token-admin',
    method: 'POST',
    body: {
      id: 'direct-template',
      templateType: 'home',
      name: 'Direct Template',
      description: 'E2E direct create',
      payload: { style: 'test' },
    },
  });
  assert.equal(directTemplate.status, 201);
  await new Promise((resolve) => setTimeout(resolve, 800));

  process.env.BP4_M4_PROXY_TARGET = m4BaseUrl;
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
  const templateResponses = [];

  page.on('response', async (response) => {
    if (
      response.request().method() === 'POST' &&
      response.url().includes('/api/bp4/m4/templates')
    ) {
      templateResponses.push({
        status: response.status(),
        body: await response.text().catch(() => ''),
      });
    }
  });

  await page.goto(`http://127.0.0.1:${vitePort}/`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('input[autocomplete="username"]').fill('admin');
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('.m4-shell').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '内容模板', exact: true }).click();
  await page.getByRole('button', { name: '创建模板' }).click();
  try {
    await page.getByText('林间基础家园').waitFor({
      timeout: 10_000,
    });
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          body: await page.locator('body').innerText(),
          templateResponses,
        },
        null,
        2,
      ),
    );
    throw error;
  }
  await page.getByPlaceholder('模板ID').fill('scene-plaza-basic');
  await page.locator('.m4-form select').selectOption('scene');
  await page.getByPlaceholder('模板名称').fill('广场基础场景');
  await page.getByRole('button', { name: '创建模板' }).click();
  await page.getByText('广场基础场景').waitFor();
  await page.getByRole('button', { name: '发布' }).first().click();
  await page.getByRole('button', { name: '数据看板', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('正常') &&
      document.body.innerText.includes('家园模板'),
    null,
    { timeout: 10_000 },
  );

  await page.waitForFunction(
    () =>
      navigator.serviceWorker?.controller !== null ||
      document.readyState === 'complete',
    null,
    { timeout: 10_000 },
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cacheKeys = await page.evaluate(() => caches.keys());

  assert.ok(cacheKeys.includes('bp4-m4-shell-v2'));

  await context.setOffline(true);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
  await page.getByText('离线缓存模式').waitFor({ timeout: 5000 });
  await context.setOffline(false);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });

  await page.screenshot({
    path: path.resolve('artifacts/bp4-m4-dashboard.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/bp4-m4-mobile.png'),
  });

  const dashboard = await apiRequest({
    baseUrl: m4BaseUrl,
    path: '/api/bp4/m4/dashboard',
    token: 'mock-token-admin',
  });
  const templates = await apiRequest({
    baseUrl: m4BaseUrl,
    path: '/api/bp4/m4/templates',
    token: 'mock-token-admin',
  });

  assert.equal(dashboard.payload.metrics.m1.available, true);
  assert.equal(dashboard.payload.metrics.m2.available, true);
  assert.equal(templates.payload.templates.length, 3);
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        templates: templates.payload.templates.length,
        homeTemplates: templates.payload.templates.filter(
          (item) => item.templateType === 'home',
        ).length,
        sceneTemplates: templates.payload.templates.filter(
          (item) => item.templateType === 'scene',
        ).length,
        published: templates.payload.templates.filter(
          (item) => item.status === 'published',
        ).length,
        m1Metrics: dashboard.payload.metrics.m1.available,
        m2Metrics: dashboard.payload.metrics.m2.available,
        serviceWorkerCache: cacheKeys,
        viewerCreateBlocked: viewerCreate.status,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  await viteServer?.close().catch(() => null);
  await m4?.close().catch(() => null);
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
