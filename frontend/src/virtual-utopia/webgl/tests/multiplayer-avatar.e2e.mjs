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
};
const sessions = new Map();
const presence = new Map();
let browser;

const listPresence = () =>
  [...presence.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, 'zh-CN'),
  );

const viteServer = await createViteServer({
  root: rootDirectory,
  configFile: path.join(rootDirectory, 'vite.config.js'),
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 5179,
    strictPort: true,
  },
});

const createMockedPage = async (username) => {
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

    if (requestPath === '/api/phase6/presence') {
      if (request.method() === 'POST') {
        const position = request.postDataJSON();
        presence.set(`phase5-${user.id}`, {
          id: `phase5-${user.id}`,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          color: user.id === 1 ? '#d76d5e' : '#4f8f7b',
          ...position,
          updatedAt: new Date().toISOString(),
        });
      }

      if (request.method() === 'DELETE') {
        presence.delete(`phase5-${user.id}`);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: listPresence(),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
  await page.goto(`http://127.0.0.1:5179/#/login`, {
    waitUntil: 'networkidle',
  });
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/#\/profile$/);
  await page.goto('http://127.0.0.1:5179/#/world', {
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

try {
  await viteServer.listen();
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const editor = await createMockedPage('traveler');
  const viewer = await createMockedPage('viewer');

  await editor.page.getByText('在线漫游者').waitFor({ timeout: 10000 });
  await viewer.page.getByText('在线漫游者').waitFor({ timeout: 10000 });
  await editor.page
    .locator('.vu-world-online li')
    .nth(1)
    .waitFor({ timeout: 10000 });
  await viewer.page
    .locator('.vu-world-online li')
    .nth(1)
    .waitFor({ timeout: 10000 });

  const before = await editor.page.evaluate(() =>
    window.__utopiaWorld.getLocalAvatarState(),
  );
  await editor.page.keyboard.down('KeyW');
  await editor.page.waitForTimeout(1000);
  const walkingState = await editor.page.evaluate(() => ({
    local: window.__utopiaWorld.getLocalAvatarState().animationState,
  }));
  const remoteWalkingState = await viewer.page.evaluate(
    () => window.__utopiaWorld.avatarObjects.get('phase5-1')?.animationState,
  );
  await editor.page.waitForTimeout(200);
  await editor.page.keyboard.up('KeyW');
  await editor.page.waitForTimeout(1500);
  const after = await editor.page.evaluate(() =>
    window.__utopiaWorld.getLocalAvatarState(),
  );
  const remoteIdleState = await viewer.page.evaluate(
    () => window.__utopiaWorld.avatarObjects.get('phase5-1')?.animationState,
  );
  const remotePosition = await viewer.page.evaluate(() => {
    const record = window.__utopiaWorld.avatarObjects.get('phase5-1');
    return record
      ? {
          x: record.group.position.x,
          y: record.group.position.y,
          z: record.group.position.z,
        }
      : null;
  });
  const movedDistance = Math.hypot(after.x - before.x, after.z - before.z);
  const remoteDistance = Math.hypot(
    remotePosition.x - before.x,
    remotePosition.z - before.z,
  );

  assert.equal(movedDistance > 1, true);
  assert.equal(remoteDistance > 0.5, true);
  assert.equal(walkingState.local, 'walk');
  assert.equal(remoteWalkingState, 'walk');
  assert.equal(after.animationState, 'idle');
  assert.equal(remoteIdleState, 'idle');
  assert.equal(
    await editor.page.evaluate(() => window.__utopiaWorld.getAvatarCount()),
    2,
  );
  assert.equal(
    await viewer.page.getByRole('button', { name: '家园装扮' }).count(),
    0,
  );
  assert.deepEqual(editor.errors, []);
  assert.deepEqual(viewer.errors, []);

  console.log(
    JSON.stringify(
      {
        onlineList: 'passed',
        avatarVisibility: 'passed',
        movementSync: 'passed',
        animationSync: 'passed',
        viewerEditorHidden: 'passed',
        movedDistance: Number(movedDistance.toFixed(2)),
        errors: [],
      },
      null,
      2,
    ),
  );
  await editor.context.close();
  await viewer.context.close();
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
