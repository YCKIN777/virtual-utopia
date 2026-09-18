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

const viteServer = await createViteServer({
  root: rootDirectory,
  configFile: path.join(rootDirectory, 'vite.config.js'),
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
  },
});
let browser;

const createMockedContext = async (role) => {
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 960,
    },
  });
  const page = await context.newPage();
  const errors = [];
  let snapshot = null;

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.route('**/phase6-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname.replace(/^\/phase6-api/, '');
    const user = {
      id: role === 'viewer' ? 8 : 7,
      username: role === 'viewer' ? 'viewer' : 'traveler',
      role,
      displayName: role === 'viewer' ? '访客' : '漫游者',
    };

    if (requestPath === '/api/phase6/auth/login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: `${role}-token`,
          expiresAt: '2099-12-31T23:59:59.999Z',
          user,
        }),
      });
      return;
    }

    if (
      requestPath === '/api/phase6/auth/me' ||
      requestPath === '/api/phase6/auth/logout'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
      return;
    }

    if (requestPath === '/api/phase6/world-state') {
      if (request.method() === 'PUT') {
        snapshot = request.postDataJSON().snapshot;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: `world-${user.id}`,
          snapshot,
          savedAt: snapshot ? '2026-09-17T12:00:00.000Z' : null,
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

  return {
    context,
    page,
    errors,
    getSnapshot: () => snapshot,
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
  const address = viteServer.httpServer.address();
  const worldUrl = `http://127.0.0.1:${address.port}/#/world`;
  const editor = await createMockedContext('editor');

  await editor.page.goto(worldUrl, {
    waitUntil: 'networkidle',
  });
  await editor.page
    .locator('.vu-world-loading')
    .waitFor({ state: 'detached', timeout: 30000 });
  await editor.page.getByRole('link', { name: '登录' }).click();
  await editor.page.getByLabel('用户名').fill('traveler');
  await editor.page.getByLabel('密码').fill('utopia2026');
  await editor.page.getByRole('button', { name: '登录', exact: true }).click();
  await editor.page.waitForURL(/#\/profile$/);
  await editor.page.goto(worldUrl, {
    waitUntil: 'networkidle',
  });
  await editor.page.getByRole('button', { name: '家园装扮' }).waitFor();
  await editor.page.getByRole('button', { name: '家园装扮' }).click();
  const stage = editor.page.locator('.vu-decorator-stage');
  await stage.waitFor();
  const initialItemCount = await editor.page
    .locator('.vu-decorator-item')
    .count();
  const bench = editor.page.getByRole('button', {
    name: /长椅/,
  });
  await bench.dragTo(stage);
  const item = editor.page.locator('.vu-decorator-item').nth(initialItemCount);
  await item.waitFor();
  assert.equal(await item.count(), 1);
  await item.click();
  await editor.page.getByRole('button', { name: '右转' }).click();
  await item.dragTo(stage, {
    targetPosition: {
      x: 520,
      y: 280,
    },
  });
  await editor.page.getByRole('button', { name: '室内', exact: true }).click();
  await editor.page.getByRole('button', { name: '盆栽', exact: true }).click();
  await editor.page.getByRole('button', { name: /陶盆绿植/ }).dragTo(stage);
  await editor.page.locator('.vu-decorator-item').first().waitFor();
  await editor.page.getByRole('button', { name: '保存' }).click();
  await editor.page.getByText('已保存到 Phase5').waitFor();
  assert.equal(
    editor.getSnapshot().courtyardItems.length,
    initialItemCount + 1,
  );
  assert.equal(editor.getSnapshot().courtyardItems.at(-1).rotation, 15);
  assert.equal(editor.getSnapshot().interiorFurniture.length, 1);
  assert.equal(
    editor.getSnapshot().interiorFurniture[0].materialId,
    'pot-ceramic',
  );
  await editor.page.getByRole('button', { name: '关闭家园编辑器' }).click();
  await editor.page.reload({ waitUntil: 'networkidle' });
  await editor.page
    .locator('.vu-world-loading')
    .waitFor({ state: 'detached', timeout: 30000 });
  await editor.page.getByRole('button', { name: '家园装扮' }).click();
  await editor.page.locator('.vu-decorator-item').first().waitFor();
  assert.equal(
    await editor.page.locator('.vu-decorator-item').count(),
    initialItemCount + 1,
  );
  await editor.page.locator('.vu-decorator-item').last().click();
  await editor.page.getByRole('button', { name: '删除' }).click();
  await editor.page.getByRole('button', { name: '室内', exact: true }).click();
  await editor.page.locator('.vu-decorator-item').first().click();
  await editor.page.getByRole('button', { name: '删除' }).click();
  await editor.page.getByRole('button', { name: '保存' }).click();
  await editor.page.getByText('已保存到 Phase5').waitFor();
  assert.equal(editor.getSnapshot().courtyardItems.length, initialItemCount);
  assert.equal(editor.getSnapshot().interiorFurniture.length, 0);
  assert.deepEqual(editor.errors, []);
  await editor.context.close();

  const viewer = await createMockedContext('viewer');
  await viewer.page.goto(worldUrl, {
    waitUntil: 'networkidle',
  });
  await viewer.page
    .locator('.vu-world-loading')
    .waitFor({ state: 'detached', timeout: 30000 });
  await viewer.page.getByRole('link', { name: '登录' }).click();
  await viewer.page.getByLabel('用户名').fill('viewer');
  await viewer.page.getByLabel('密码').fill('utopia2026');
  await viewer.page.getByRole('button', { name: '登录', exact: true }).click();
  await viewer.page.waitForURL(/#\/profile$/);
  await viewer.page.goto(worldUrl, {
    waitUntil: 'networkidle',
  });
  assert.equal(
    await viewer.page.getByRole('button', { name: '家园装扮' }).count(),
    0,
  );
  assert.deepEqual(viewer.errors, []);
  await viewer.context.close();

  console.log(
    JSON.stringify(
      {
        editorVisible: 'passed',
        dragPlacement: 'passed',
        moveRotateDelete: 'passed',
        save: 'passed',
        refreshRestore: 'passed',
        viewerHidden: 'passed',
        errors: [],
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
