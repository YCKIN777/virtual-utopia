import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const WORLD = 'http://localhost:5175';
await mkdir(path.resolve('vu_screens'), { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

// 居民 traveler：进入自家宅院 → 装饰器解锁 + 参观权限面板 + 同屏侧面板
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${WORLD}/#/login`, { waitUntil: 'networkidle' });
await page.fill('input[placeholder="traveler"]', 'traveler');
await page.fill('input[placeholder="utopia2026"]', 'utopia2026');
await page.click('button[type="submit"]');
await page.waitForURL(/#\/profile/, { timeout: 15000 });
await page.goto(`${WORLD}/#/world`, { waitUntil: 'domcontentloaded' });

// 等待装饰器触发按钮出现（初始锁定）
await page.waitForSelector('.vu-decorator-trigger', { timeout: 60000 });
const lockedBefore = await page.locator('.vu-decorator-trigger').isDisabled();
record('初始未进宅院：装饰器锁定', lockedBefore, lockedBefore ? '已锁定' : '未锁定');

// 点击「回我的家」飞到自家宅院
await page.click('button:has-text("回我的家")');
await page.waitForTimeout(3500);

// 家园面板应打开（参观权限切换）
const homePanel = await page.locator('.vu-home-panel').count();
record('回我家后家园面板打开', homePanel === 1);
const visitLabel = await page.locator('text=参观权限').count();
record('家园面板含「参观权限」开关', visitLabel >= 1);

// 装饰器应解锁
const lockedAfter = await page.locator('.vu-decorator-trigger').isDisabled();
const triggerText = (await page.locator('.vu-decorator-trigger').textContent()).trim();
record('进入自家宅院后装饰器解锁', !lockedAfter, triggerText);

// 点击打开装饰器侧面板（同屏）
if (!lockedAfter) {
  await page.click('.vu-decorator-trigger');
  await page.waitForTimeout(600);
  const panel = await page.locator('.vu-decorator-panel').count();
  record('装饰器同屏侧面板打开', panel === 1);
  await page.screenshot({ path: path.resolve('vu_screens/resident_editor_open.png'), fullPage: true });
  // 关闭
  await page.click('.vu-decorator-close').catch(() => {});
}

await page.screenshot({ path: path.resolve('vu_screens/resident_in_own_yard.png'), fullPage: true });
const serr = errors.filter((e) => !/favicon/i.test(e));
record('居民全程0控制台报错', serr.length === 0, serr.length === 0 ? '0 条' : serr.slice(0, 3).join(' | '));
await ctx.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log('\n=== 汇总:', failed.length === 0 ? '全部通过' : `${failed.length} 项失败`, '===');
process.exit(failed.length ? 1 : 0);
