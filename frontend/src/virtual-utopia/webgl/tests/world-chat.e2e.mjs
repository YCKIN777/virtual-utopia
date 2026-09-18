import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, '../..');
const browserCandidates = [
  process.env.PLAYWRIGHT_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const accounts = {
  traveler: {
    id: 1,
    username: 'traveler',
    role: 'editor',
    displayName: '漫游者',
  },
  viewer: {
    id: 2,
    username: 'viewer',
    role: 'viewer',
    displayName: '访客',
  },
  admin: {
    id: 3,
    username: 'admin',
    role: 'admin',
    displayName: '管理员',
  },
};
const sessions = new Map();
const chatMessages = [];
let browser;

const viteServer = await createViteServer({
  root: rootDirectory,
  configFile: path.join(rootDirectory, 'vite.config.js'),
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
});

const createPage = async (username) => {
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 960,
    },
  });
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.route('**/phase6-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname.replace(/^\/phase6-api/, '');
    const authorization = request.headers().authorization || '';
    const token = authorization.replace(/^Bearer\s+/, '');
    const user = sessions.get(token);

    if (requestPath === '/api/phase6/auth/login') {
      const body = request.postDataJSON();
      const account = accounts[body.username];
      const loginToken = `${body.username}-token`;
      sessions.set(loginToken, account);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: loginToken,
          expiresAt: '2099-12-31T23:59:59.999Z',
          user: account,
        }),
      });
      return;
    }

    if (!user) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PHASE5_UNAUTHORIZED',
          message: 'authentication required',
        }),
      });
      return;
    }

    if (requestPath === '/api/phase6/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
      return;
    }

    if (requestPath === '/api/phase6/chat/world') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        const message = {
          id: `chat-${chatMessages.length + 1}`,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          content: body.content,
          createdAt: new Date(Date.now() + chatMessages.length).toISOString(),
        };
        chatMessages.push(message);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId: 'world-chat-global',
            message,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'world-chat-global',
          messages: chatMessages,
        }),
      });
      return;
    }

    if (requestPath === '/api/phase6/presence') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body:
          request.method() === 'DELETE'
            ? JSON.stringify({ users: [] })
            : JSON.stringify({
                users: [
                  {
                    id: `phase5-${user.id}`,
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    role: user.role,
                    color: '#4f8f7b',
                    x: 0,
                    y: 0,
                    z: 0,
                    rotation: 0,
                    animationState: 'idle',
                  },
                ],
              }),
      });
      return;
    }

    if (
      requestPath === '/api/phase6/auth/logout' ||
      requestPath === '/api/phase6/world-state'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body:
          requestPath === '/api/phase6/world-state'
            ? JSON.stringify({
                sessionId: `world-${user.id}`,
                snapshot: null,
                savedAt: null,
              })
            : JSON.stringify({ status: 'logged_out' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
  await page.goto('http://127.0.0.1:5180/#/login', {
    waitUntil: 'networkidle',
  });
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/#\/profile$/);
  await page.goto('http://127.0.0.1:5180/#/world', {
    waitUntil: 'networkidle',
  });
  await page
    .locator('.vu-world-loading')
    .waitFor({ state: 'detached', timeout: 30000 });

  return {
    context,
    page,
    errors,
  };
};

const openChat = async (page) => {
  await page.getByRole('button', { name: /世界频道/ }).click();
  await page.getByPlaceholder('发送世界消息').waitFor();
};

try {
  await viteServer.listen();
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const editor = await createPage('traveler');
  const viewer = await createPage('viewer');

  await openChat(editor.page);
  await editor.page.getByPlaceholder('发送世界消息').fill('你好，世界');
  await editor.page.getByRole('button', { name: '发送', exact: true }).click();
  await editor.page.getByText('你好，世界').waitFor();

  await openChat(viewer.page);
  await viewer.page.getByText('你好，世界').waitFor({ timeout: 10000 });
  await viewer.page.getByText('漫游者').first().waitFor();

  const admin = await createPage('admin');
  await openChat(admin.page);
  await admin.page.getByText('你好，世界').waitFor({ timeout: 10000 });

  assert.equal(chatMessages.length, 1);
  assert.deepEqual(editor.errors, []);
  assert.deepEqual(viewer.errors, []);
  assert.deepEqual(admin.errors, []);

  console.log(
    JSON.stringify(
      {
        chatPanel: 'passed',
        realtimeDelivery: 'passed',
        historyForNewUser: 'passed',
        senderName: 'passed',
        errors: [],
      },
      null,
      2,
    ),
  );
  await editor.context.close();
  await viewer.context.close();
  await admin.context.close();
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
