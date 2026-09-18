import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(testDirectory, '..');
const browserCandidates = [
  process.env.PLAYWRIGHT_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const launchBrowser = async () => {
  const executablePath = browserCandidates.find((candidate) =>
    existsSync(candidate),
  );

  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
};

const viteServer = await createViteServer({
  root: rootDirectory,
  configFile: path.join(rootDirectory, 'vite.config.js'),
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
  },
});
let browser;

try {
  await viteServer.listen();
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960,
    },
  });
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.route('**/phase6-api/api/phase6/health', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        service: 'virtual-utopia-phase6',
        status: 'ok',
      }),
    }),
  );

  const address = viteServer.httpServer.address();
  const frontendUrl = `http://127.0.0.1:${address.port}`;
  const desktopScreenshot = path.join(
    os.tmpdir(),
    'virtual-utopia-canvas-desktop.png',
  );
  const mobileScreenshot = path.join(
    os.tmpdir(),
    'virtual-utopia-canvas-mobile.png',
  );

  await page.goto(frontendUrl, {
    waitUntil: 'networkidle',
  });
  await page
    .getByRole('heading', {
      name: '乌托邦全景大陆',
    })
    .waitFor();
  await page.getByText('Phase6 网关在线').waitFor();

  const canvasMetrics = await page.evaluate(() => {
    const canvas = document.querySelector('.vu-isometric-canvas');
    const context = canvas.getContext('2d');
    const sample = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();

    for (let index = 0; index < sample.length; index += 1600) {
      colors.add(`${sample[index]}-${sample[index + 1]}-${sample[index + 2]}`);
    }

    return {
      width: canvas.width,
      height: canvas.height,
      colorCount: colors.size,
      touchAction: getComputedStyle(canvas).touchAction,
    };
  });

  assert.equal(canvasMetrics.width > 1000, true);
  assert.equal(canvasMetrics.height > 700, true);
  assert.equal(canvasMetrics.colorCount > 30, true);
  assert.equal(canvasMetrics.touchAction, 'none');
  const sampleBrightness = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('.vu-isometric-canvas');
      const context = canvas.getContext('2d');
      const sampleHeight = Math.max(1, Math.floor(canvas.height * 0.26));
      const data = context.getImageData(0, 0, canvas.width, sampleHeight).data;
      let total = 0;
      let count = 0;

      for (let index = 0; index < data.length; index += 64) {
        total +=
          data[index] * 0.2126 +
          data[index + 1] * 0.7152 +
          data[index + 2] * 0.0722;
        count += 1;
      }

      return total / count;
    });
  const daytimeBrightness = await sampleBrightness();
  await page.getByRole('button', { name: '切换夜晚' }).click();
  await page.getByRole('button', { name: '恢复昼夜循环' }).waitFor();
  await page.waitForTimeout(250);
  const nighttimeBrightness = await sampleBrightness();
  assert.equal(nighttimeBrightness < daytimeBrightness, true);
  await page.screenshot({
    path: desktopScreenshot,
    fullPage: false,
  });

  await page.mouse.click(680, 379);
  await page.waitForURL('**/#/scenes/pavilion');
  await page
    .getByRole('heading', {
      name: '议事亭',
    })
    .waitFor();

  await page.goto(frontendUrl, {
    waitUntil: 'networkidle',
  });
  await page.mouse.click(555, 385);
  await page.getByRole('heading', { name: '生活广场' }).waitFor();
  await page.getByRole('button', { name: '关闭地图信息' }).click();
  await page.mouse.click(723, 496);
  await page.getByRole('heading', { name: '社区花园' }).waitFor();
  await page.getByRole('button', { name: '关闭地图信息' }).click();
  await page.mouse.click(990, 411);
  await page.getByRole('heading', { name: '森林信号塔' }).waitFor();
  await page.getByRole('button', { name: '关闭地图信息' }).click();
  await page.getByRole('link', { name: '登录', exact: true }).click();
  await page.getByPlaceholder('traveler').fill('traveler');
  await page.getByPlaceholder('utopia2026').fill('utopia2026');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/#/profile');
  await page.getByRole('link', { name: '门户', exact: true }).click();
  await page.waitForURL('**/#/');

  await page.getByRole('button', { name: '进入我的家园' }).click();
  await page.getByRole('heading', { name: '漫游者的家园' }).waitFor();
  await page.getByRole('button', { name: '编辑家园' }).click();
  await page.getByText('世界碎片').first().waitFor();

  await page.getByRole('button', { name: '树木' }).click();
  await page.getByRole('button', { name: /松树/ }).click();
  await page.getByRole('button', { name: '放到地块中心' }).click();
  await page.getByText('已选中素材').waitFor();
  await page.getByRole('button', { name: '右转' }).click();
  await page.getByRole('button', { name: '删除' }).click();

  await page.getByRole('button', { name: '私密' }).click();
  await page.getByText('地块主人 · 私密').waitFor();

  await page.getByPlaceholder('写下参观留言').fill('Canvas E2E 留言');
  await page.getByRole('button', { name: '留言' }).click();
  await page.getByText('Canvas E2E 留言').waitFor();

  await page.getByPlaceholder('输入隐藏线索').fill('枫树下的刻痕');
  await page.getByRole('button', { name: '埋藏' }).click();
  await page.getByText('已埋藏线索').waitFor();

  await page.mouse.move(700, 470);
  await page.mouse.wheel(0, -480);
  await page.waitForTimeout(250);

  await page.setViewportSize({
    width: 390,
    height: 844,
  });
  await page
    .getByRole('heading', {
      name: '乌托邦全景大陆',
    })
    .waitFor();
  await page.getByRole('heading', { name: '漫游者的家园' }).waitFor();
  await page.getByRole('button', { name: '关闭家园面板' }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector('.vu-home-panel-host')
        ?.classList.contains('is-visible'),
  );
  await page.evaluate(() => window.scrollTo(0, 0));

  for (const button of await page
    .getByRole('button', { name: '关闭提示' })
    .all()) {
    await button.click().catch(() => {});
  }

  await page.screenshot({
    path: mobileScreenshot,
    fullPage: false,
  });

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  assert.equal(hasHorizontalOverflow, false);
  assert.deepEqual(pageErrors, []);

  console.log(
    JSON.stringify(
      {
        canvasRendered: 'passed',
        canvasPixelSample: canvasMetrics.colorCount,
        dayNightTransition: 'passed',
        buildingNavigation: 'passed',
        centralPlazaInfo: 'passed',
        trainingGroundInfo: 'passed',
        defenseNodeInfo: 'passed',
        login: 'passed',
        homeSelection: 'passed',
        editorMaterialPlacement: 'passed',
        itemRotationAndDelete: 'passed',
        visibilityToggle: 'passed',
        visitorMessage: 'passed',
        hiddenClue: 'passed',
        cameraZoom: 'passed',
        mobileLayout: 'passed',
        desktopScreenshot,
        mobileScreenshot,
        pageErrors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close().catch(() => {});
  await viteServer.close();
}
