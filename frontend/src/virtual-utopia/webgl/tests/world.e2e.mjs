import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';
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
    port: 5177,
    strictPort: true,
  },
});
let browser;

try {
  await viteServer.listen();
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960,
    },
  });
  const errors = [];
  const glbRequests = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) {
      glbRequests.push(request.url());
    }
  });

  const address = viteServer.httpServer.address();
  const worldUrl = `http://127.0.0.1:${address.port}/#/world`;
  await page.goto(worldUrl, {
    waitUntil: 'networkidle',
  });
  await page.getByText('五十户山林庄园城镇').waitFor();
  await page.locator('.vu-world-loading').waitFor({
    state: 'detached',
    timeout: 30000,
  });
  await page.getByText('50/50 庄园').waitFor();

  const canvasState = await page.locator('canvas').evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    webgl:
      Boolean(canvas.getContext('webgl2')) ||
      Boolean(canvas.getContext('webgl')),
  }));

  assert.equal(canvasState.width > 300, true);
  assert.equal(canvasState.height > 250, true);
  assert.equal(canvasState.webgl, true);
  assert.equal(glbRequests.length >= 3, true);

  const overviewPath = path.join(
    os.tmpdir(),
    'virtual-utopia-town-overview.png',
  );
  await page.screenshot({
    path: overviewPath,
    fullPage: false,
  });

  await page.getByRole('button', { name: '俯瞰全景' }).click();
  await page.getByRole('button', { name: '退出俯瞰' }).waitFor();
  await page.waitForTimeout(2900);
  await page.getByText('城镇全景').waitFor();

  await page.getByRole('button', { name: '回我的家' }).click();
  await page.getByText('生态庄园 1').waitFor();
  await page.getByText('独立庭院').waitFor();
  await page.waitForTimeout(2800);
  const homeDayPath = path.join(
    os.tmpdir(),
    'virtual-utopia-town-home-day.png',
  );
  await page.screenshot({
    path: homeDayPath,
    fullPage: false,
  });

  await page.getByRole('button', { name: '室内模式' }).click();
  await page.getByRole('button', { name: '恢复外壳' }).waitFor();

  await page.getByRole('button', { name: '切换夜晚' }).click();
  await page.getByRole('button', { name: '切换日间' }).waitFor();

  await page.getByRole('button', { name: '关闭雾气' }).click();
  await page.getByRole('button', { name: '开启雾气' }).waitFor();

  const screenshotPath = path.join(os.tmpdir(), 'virtual-utopia-town-3d.png');
  await page.waitForTimeout(2800);
  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
  });

  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  assert.equal(overflow, false);
  assert.deepEqual(errors, []);

  console.log(
    JSON.stringify(
      {
        worldLoaded: 'passed',
        canvas: canvasState,
        glbModels: glbRequests.map((url) =>
          path.basename(new URL(url).pathname),
        ),
        flyHome: 'passed',
        overviewMode: 'passed',
        interiorMode: 'passed',
        dayNight: 'passed',
        fogToggle: 'passed',
        mobileLayout: 'passed',
        overviewPath,
        homeDayPath,
        screenshotPath,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
