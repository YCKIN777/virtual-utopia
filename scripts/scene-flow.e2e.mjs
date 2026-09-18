import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../backend/src/app.js';
import { createDeepSeekClient } from '../backend/src/services/deepSeekClient.js';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const frontendDirectory = path.join(rootDirectory, 'frontend');
const backendUrl = 'http://localhost:3000';
const frontendUrl = 'http://localhost:5173';
const browserCandidates = [
  process.env.PLAYWRIGHT_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

dotenv.config({
  path: path.join(rootDirectory, 'backend', '.env'),
  override: true,
  quiet: true,
});

const deepSeekClient = createDeepSeekClient({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
});

const modelClient = {
  async createStructuredResponse({ messages, responseSchema }) {
    const systemMessage = messages[0]?.content || '';
    const userMessage = messages.at(-1)?.content || '';
    const sceneId = systemMessage.match(/当前场景：.+?（([^）]+)）/)?.[1];

    assert.ok(sceneId, 'system prompt must include scene id');

    try {
      const response = await deepSeekClient.createStructuredResponse({
        messages,
        responseSchema,
      });

      return {
        ...response,
        data: {
          ...response.data,
          reply: `${sceneId}:${userMessage}`,
        },
      };
    } catch (error) {
      console.error('DeepSeek E2E request failed:');
      console.error(error.stack || error);
      const e2eError = new Error(
        `DeepSeek E2E request failed: ${error.message}`,
        { cause: error },
      );
      e2eError.name = 'DeepSeekE2EError';
      e2eError.code = 'E2E_DEEPSEEK_ERROR';
      throw e2eError;
    }
  },
};

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const launchBrowser = async () => {
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );

  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
};

let browser;
let backendServer;
process.chdir(frontendDirectory);
const viteServer = await createViteServer({
  root: frontendDirectory,
  configFile: path.join(frontendDirectory, 'vite.config.js'),
  logLevel: 'silent',
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
});

try {
  backendServer = createApp({ modelClient }).listen(3000);
  await new Promise((resolve, reject) => {
    backendServer.once('listening', resolve);
    backendServer.once('error', reject);
  });
  browser = await launchBrowser();
  await viteServer.listen();

  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 860,
    },
  });
  const consoleErrors = [];
  const apiRequests = [];

  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/scene/route')) {
      apiRequests.push(request.url());
    }

    if (process.env.DEBUG_E2E && request.url().includes('/api/')) {
      console.error('E2E_REQUEST', request.method(), request.url());
    }
  });
  page.on('requestfailed', (request) => {
    if (process.env.DEBUG_E2E) {
      console.error(
        'E2E_REQUEST_FAILED',
        request.url(),
        request.failure()?.errorText,
      );
    }
  });
  page.on('response', (response) => {
    if (process.env.DEBUG_E2E && response.url().includes('/api/')) {
      console.error('E2E_RESPONSE', response.status(), response.url());
    }
  });

  const sceneChecks = [
    { name: '大院', sceneId: 'yard', type: 'public', agentId: 'ahe' },
    {
      name: '资源墙',
      sceneId: 'resource-wall',
      type: 'public',
      agentId: 'zhiyu',
    },
    {
      name: '议事亭',
      sceneId: 'pavilion',
      type: 'public',
      agentId: 'xubai',
    },
    {
      name: '书屋',
      sceneId: 'library',
      type: 'public',
      agentId: 'suian',
    },
    {
      name: '小屋',
      sceneId: 'cabin',
      type: 'private',
      agentId: 'fenghe',
    },
  ];

  const sessions = {};

  for (const scene of sceneChecks) {
    await page.goto(frontendUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: `进入${scene.name}` }).click();
    await page.waitForURL(`**/scene/${scene.sceneId}`);
    await page.getByText(`${scene.name}会话已就绪`).waitFor();
    await page.getByPlaceholder('输入消息').fill(`e2e-${scene.sceneId}`);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/scene/route') &&
        response.request().method() === 'POST',
    );

    const sendButton = page.getByRole('button', { name: '发送消息' });
    const messageInput = page.getByPlaceholder('输入消息');

    if (process.env.DEBUG_E2E) {
      console.error(
        'E2E_BEFORE_SEND',
        JSON.stringify({
          disabled: await sendButton.isDisabled(),
          inputValue: await messageInput.inputValue(),
        }),
      );
    }

    const [response] = await Promise.all([
      responsePromise,
      sendButton.click({ timeout: 5000 }),
    ]);
    const payload = await response.json();

    assert.equal(response.status(), 200);
    assert.equal(payload.meta.targetAgentId, scene.agentId);
    assert.equal(payload.meta.session.type, scene.type);
    assert.equal(payload.meta.session.sceneId, scene.sceneId);
    assert.equal(payload.meta.session.ownerAgentId, scene.agentId);
    sessions[scene.sceneId] = payload.meta.session.id;
    assert.match(
      sessions[scene.sceneId],
      scene.type === 'private' ? /^prv_/ : /^pub_/,
    );
    await page.getByText(`${scene.sceneId}:e2e-${scene.sceneId}`).waitFor();
  }

  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '进入大院' }).click();
  await page.waitForURL('**/scene/yard');
  await page.getByText('大院会话已就绪').waitFor();
  await page.getByPlaceholder('输入消息').fill('context-yard');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/scene/route') &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: '发送消息' }).click(),
  ]);
  await page.getByText('yard:context-yard').waitFor();
  await page.getByRole('button', { name: '返回地图' }).click();
  await page.waitForURL(`${frontendUrl}/`);
  await page.getByRole('button', { name: '进入小屋' }).click();
  await page.waitForURL('**/scene/cabin');
  await page.getByText('小屋会话已就绪').waitFor();
  await page.getByPlaceholder('输入消息').fill('context-cabin');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/scene/route') &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: '发送消息' }).click(),
  ]);
  await page.getByText('cabin:context-cabin').waitFor();
  const cabinHasYardMessage = await page
    .getByText('yard:context-yard')
    .isVisible()
    .catch(() => false);
  assert.equal(cabinHasYardMessage, false);
  await page.getByRole('button', { name: '返回地图' }).click();
  await page.waitForURL(`${frontendUrl}/`);
  await page.getByRole('button', { name: '进入大院' }).click();
  await page.waitForURL('**/scene/yard');
  await page.getByText('yard:context-yard').waitFor();
  assert.equal(
    await page
      .getByText('cabin:context-cabin')
      .isVisible()
      .catch(() => false),
    false,
  );

  const leakResponse = await page.evaluate(
    async ({ backend, sessionId }) => {
      const response = await fetch(`${backend}/api/scene/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId: 'yard',
          sessionId,
          input: {
            content: '越权读取',
          },
        }),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      backend: backendUrl,
      sessionId: sessions.cabin,
    },
  );
  assert.equal(leakResponse.status, 403);
  assert.equal(leakResponse.body.code, 'SESSION_SCOPE_VIOLATION');

  const invalidSessionResponse = await page.evaluate(
    async ({ backend }) => {
      const response = await fetch(`${backend}/api/scene/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId: 'cabin',
          sessionId: 'invalid',
          input: {
            content: '测试',
          },
        }),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    },
    {
      backend: backendUrl,
    },
  );
  assert.equal(invalidSessionResponse.status, 400);
  assert.equal(invalidSessionResponse.body.code, 'INVALID_SESSION_ID');

  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '进入书屋' }).click();
  await page.waitForURL('**/scene/library');
  await page.getByText('书屋会话已就绪').waitFor();
  await page.getByPlaceholder('输入消息').fill('slow-loading');
  const slowResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/scene/route') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送消息' }).click();
  await page
    .locator('button[aria-label="发送消息"] span.animate-spin')
    .waitFor();
  const loadingStateVisible = true;
  await slowResponsePromise;
  await page.getByText('library:slow-loading').waitFor();

  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  const requestCountBeforeFarForest = apiRequests.length;
  await page.getByRole('button', { name: '进入远林' }).click();
  await page.waitForURL('**/scene/far-forest');
  assert.equal(await page.getByPlaceholder('远林暂未开放').isDisabled(), true);
  assert.equal(apiRequests.length, requestCountBeforeFarForest);

  await page.goto(frontendUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '进入书屋' }).click();
  await page.waitForURL('**/scene/library');
  await page.route('**/api/scene/route', (route) => route.abort('failed'));
  await page.getByPlaceholder('输入消息').fill('network-error');
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.getByText('无法连接后端服务').first().waitFor();
  await page.unroute('**/api/scene/route');
  await page.getByPlaceholder('输入消息').fill('network-retry');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/scene/route') &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: '发送消息' }).click(),
  ]);
  await page.getByText('library:network-retry').waitFor();
  const networkRetrySucceeded = true;

  assert.deepEqual(consoleErrors, []);

  console.log(
    JSON.stringify(
      {
        scenes: sceneChecks.length,
        sessions,
        contextIsolation: 'passed',
        privateSessionLeak: leakResponse.body.code,
        invalidSession: invalidSessionResponse.body.code,
        farForestRequestBlocked: true,
        loadingStateVisible,
        networkErrorToast: 'passed',
        networkRetrySucceeded,
        apiRequests: apiRequests.length,
        consoleErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();

  if (backendServer?.listening) {
    await closeServer(backendServer);
  }
}
