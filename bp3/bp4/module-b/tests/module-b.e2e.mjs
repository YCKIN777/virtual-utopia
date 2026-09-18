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
import { readModuleAConfig } from '../../module-a/backend/src/config.js';
import { startModuleAServer } from '../../module-a/backend/src/server.js';
import { readModuleBConfig } from '../backend/src/config.js';
import { startModuleBServer } from '../backend/src/server.js';

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
  visitor: {
    id: 3,
    username: 'visitor',
    displayName: '访客',
    role: 'viewer',
    password: 'utopia2026',
  },
  friend: {
    id: 4,
    username: 'friend',
    displayName: '好友',
    role: 'editor',
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
let moduleB;
let viteServer;
let browser;
let temporaryDirectory;
const probes = [];

try {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'module-b-e2e-'));
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
      allowedOrigins: [],
    },
    authAdapter,
  });
  const moduleABaseUrl = `http://127.0.0.1:${moduleA.server.address().port}`;
  const moduleBApiRequest = async ({
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

  assert.equal(
    (
      await moduleBApiRequest({
        token: 'mock-token-admin',
        path: '/api/bp4/module-a/homes/plot-1/owner',
        method: 'PUT',
        body: {
          ownerUserId: 2,
          ownerUsername: 'owner',
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await moduleBApiRequest({
        token: 'mock-token-admin',
        path: '/api/bp4/module-a/homes/plot-1/access',
        method: 'PUT',
        body: {
          accessMode: 'private',
          friendUserIds: [],
        },
      })
    ).status,
    200,
  );

  moduleB = await startModuleBServer({
    config: {
      ...readModuleBConfig(),
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'module-b.sqlite'),
      moduleABaseUrl,
      phase5BaseUrl: phase5.baseUrl,
      allowedOrigins: [
        `http://127.0.0.1:${vitePort}`,
        `http://localhost:${vitePort}`,
      ],
    },
    authAdapter,
  });
  const moduleBBaseUrl = `http://127.0.0.1:${moduleB.server.address().port}`;
  const apiRequest = async ({
    token,
    path: requestPath,
    method = 'GET',
    body,
  }) => {
    const response = await fetch(`${moduleBBaseUrl}${requestPath}`, {
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
  const createProbe = async (token) => {
    const ticket = await apiRequest({
      token,
      path: '/api/bp4/module-b/realtime/ticket',
      method: 'POST',
    });
    const messages = [];
    const socket = new WebSocket(
      `${moduleBBaseUrl.replace(/^http/, 'ws')}/ws/bp4/realtime?ticket=${encodeURIComponent(ticket.payload.ticket)}`,
    );

    socket.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()));
    });
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    const probe = {
      messages,
      socket,
    };

    probes.push(probe);
    return probe;
  };
  const subscribe = async (probe, channel) => {
    const before = probe.messages.length;

    probe.socket.send(
      JSON.stringify({
        type: 'chat.subscribe',
        channel,
      }),
    );
    await waitFor(
      () =>
        probe.messages
          .slice(before)
          .some(
            (message) =>
              message.type === 'subscribed' || message.type === 'error',
          ),
      5000,
    );

    return probe.messages.at(-1);
  };
  const ownerProbe = await createProbe('mock-token-owner');
  const visitorProbe = await createProbe('mock-token-visitor');
  const friendProbe = await createProbe('mock-token-friend');

  assert.equal(
    (await subscribe(ownerProbe, { type: 'world' })).type,
    'subscribed',
  );
  assert.equal(
    (
      await subscribe(visitorProbe, {
        type: 'world',
      })
    ).type,
    'subscribed',
  );

  ownerProbe.socket.send(
    JSON.stringify({
      type: 'chat.send',
      channel: { type: 'world' },
      content: 'hello shit 诈骗',
    }),
  );
  await waitFor(() =>
    visitorProbe.messages.some(
      (message) =>
        message.type === 'chat.message.created' &&
        message.data?.content === 'hello *** ***',
    ),
  );
  const worldMessage = visitorProbe.messages.find(
    (message) =>
      message.type === 'chat.message.created' &&
      message.data?.content === 'hello *** ***',
  ).data;

  assert.equal(worldMessage.filtered, true);
  const worldHistory = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-b/messages?channelType=world',
  });

  assert.equal(worldHistory.payload.messages[0].content, 'hello *** ***');

  assert.equal(
    (
      await subscribe(ownerProbe, {
        type: 'home',
        plotId: 'plot-1',
      })
    ).type,
    'subscribed',
  );
  assert.equal(
    (
      await subscribe(visitorProbe, {
        type: 'home',
        plotId: 'plot-1',
      })
    ).type,
    'error',
  );
  assert.equal(
    (
      await subscribe(friendProbe, {
        type: 'home',
        plotId: 'plot-1',
      })
    ).type,
    'error',
  );
  ownerProbe.socket.send(
    JSON.stringify({
      type: 'chat.send',
      channel: {
        type: 'home',
        plotId: 'plot-1',
      },
      content: 'private home',
    }),
  );
  await waitFor(() =>
    ownerProbe.messages.some(
      (message) =>
        message.type === 'chat.message.created' &&
        message.data?.content === 'private home',
    ),
  );

  await moduleBApiRequest({
    token: 'mock-token-admin',
    path: '/api/bp4/module-a/homes/plot-1/access',
    method: 'PUT',
    body: {
      accessMode: 'friends',
      friendUserIds: [4],
    },
  });
  assert.equal(
    (
      await subscribe(friendProbe, {
        type: 'home',
        plotId: 'plot-1',
      })
    ).type,
    'subscribed',
  );
  ownerProbe.socket.send(
    JSON.stringify({
      type: 'chat.send',
      channel: {
        type: 'home',
        plotId: 'plot-1',
      },
      content: 'friend home',
    }),
  );
  await waitFor(() =>
    friendProbe.messages.some(
      (message) =>
        message.type === 'chat.message.created' &&
        message.data?.content === 'friend home',
    ),
  );

  assert.equal((await subscribe(visitorProbe, 'dm-2-3')).type, 'subscribed');
  assert.equal((await subscribe(friendProbe, 'dm-2-3')).type, 'error');
  ownerProbe.socket.send(
    JSON.stringify({
      type: 'chat.send',
      channel: {
        type: 'direct',
        targetUserId: 3,
      },
      content: 'direct hello',
    }),
  );
  await waitFor(() =>
    visitorProbe.messages.some(
      (message) =>
        message.type === 'chat.message.created' &&
        message.data?.content === 'direct hello',
    ),
  );

  ownerProbe.socket.send(
    JSON.stringify({
      type: 'chat.recall',
      messageId: worldMessage.id,
    }),
  );
  await waitFor(() =>
    visitorProbe.messages.some(
      (message) =>
        message.type === 'event.updated' &&
        message.data?.kind === 'chat.message.recalled' &&
        message.data?.id === worldMessage.id,
    ),
  );
  const recalledHistory = await apiRequest({
    token: 'mock-token-visitor',
    path: '/api/bp4/module-b/messages?channelType=world',
  });
  const recalledMessage = recalledHistory.payload.messages.find(
    (message) => message.id === worldMessage.id,
  );

  assert.equal(recalledMessage.status, 'recalled');
  assert.equal(recalledMessage.content, '[消息已撤回]');

  process.env.BP4_MODULE_B_PROXY_TARGET = moduleBBaseUrl;
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
  await page.locator('input[autocomplete="username"]').fill('owner');
  await page
    .locator('input[autocomplete="current-password"]')
    .fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-realtime-status]')?.dataset
        .realtimeStatus === 'online',
    null,
    { timeout: 15_000 },
  );

  await page.getByPlaceholder('输入消息').fill('ui hello');
  await page.getByRole('button', { name: '发送' }).click();
  const uiMessage = page
    .locator('.mb-messages article')
    .filter({ hasText: 'ui hello' });

  await uiMessage.waitFor({ timeout: 5000 });
  await uiMessage.getByRole('button', { name: '撤回' }).click();
  await page.getByText('[消息已撤回]').last().waitFor({ timeout: 5000 });

  await page.screenshot({
    path: path.resolve('artifacts/module-b-chat.png'),
  });
  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.resolve('artifacts/module-b-mobile.png'),
  });

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        worldChat: true,
        homePermissionLinkage: true,
        directChat: true,
        filteredMessage: 'hello *** ***',
        recall: true,
        persistedHistory: true,
        realtimeChannels: ['world-main', 'home-plot-1', 'dm-2-3'],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => null);
  probes.forEach((probe) => probe.socket.close());
  await viteServer?.close().catch(() => null);
  await moduleB?.close().catch(() => null);
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
