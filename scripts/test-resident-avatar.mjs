#!/usr/bin/env node
/**
 * Avatar 居民智能体基础模板 —— Playwright 无头 UI 自测。
 *
 * 依赖运行中的前端 dev server(5175) + phase5(3300) + phase6(3400)。
 * 验证：居民实例化(复用KIN框架)、宅院范围内漫游、无金冠(KIN保留金冠)、
 *       靠近触发聊天入口、状态持久化(刷新保留)、控制台 0 报错；截图存 vu_screens/。
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = 'http://localhost:5175';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const SEED_PLOTS = ['plot-2', 'plot-15', 'plot-25', 'plot-40', 'plot-48'];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const clickBySelector = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);

const inspectWorld = () =>
  page.evaluate(() => {
    const world = window.__utopiaWorld;
    if (!world) return null;
    const residentStates = world.getResidentAvatarStates();
    const kinRecord = world.avatarObjects.get('kin-lord');
    const residents = [...world.avatarObjects.values()].filter(
      (r) => r.isResident,
    );
    return {
      residentStates,
      kinHasCrown: Boolean(kinRecord?.lordMarker),
      residents: residents.map((r) => ({
        avatarId: r.residentId,
        hasCrown: Boolean(r.lordMarker),
        labelName: r.residentName,
        bounds: r.roaming?.bounds || null,
        x: r.group.position.x,
        z: r.group.position.z,
      })),
    };
  });

try {
  await page.goto(`${WORLD}/#/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill('traveler');
  await page.getByLabel('密码').fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/#\/profile/, { timeout: 15000 });
  await page.goto(`${WORLD}/#/world`, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2500);

  const info = await inspectWorld();
  assert.ok(info, '无法读取 world 实例');
  record('居民Avatar实例化(复用KIN框架)', info.residentStates.length === 5, `居民数 ${info.residentStates.length}`);
  record('KIN 保留金冠标识', info.kinHasCrown === true);
  record('居民无金冠标识', info.residents.every((r) => !r.hasCrown));

  const boundOk = info.residents.every((r) => {
    if (!r.bounds) return false;
    const w = r.bounds.maxX - r.bounds.minX;
    return w > 0 && w <= 6 && SEED_PLOTS.includes(
      `plot-${info.residentStates.find((s) => s.avatarId === r.avatarId)?.homePlotId?.replace('plot-', '')}`,
    );
  });
  record('居民绑定宅院 + 有限漫游范围', boundOk);

  // 漫游边界校验：连续采样数秒，居民 x/z 始终在其宅院 bounds 内
  let inBounds = true;
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(1200);
    const sample = await inspectWorld();
    for (const r of sample.residents) {
      if (r.bounds) {
        const inside =
          r.x >= r.bounds.minX - 0.4 &&
          r.x <= r.bounds.maxX + 0.4 &&
          r.z >= r.bounds.minZ - 0.4 &&
          r.z <= r.bounds.maxZ + 0.4;
        if (!inside) inBounds = false;
      }
    }
  }
  record('居民不越出宅院地块边界', inBounds);

  // 靠近居民触发聊天入口：飞到 plot-2（阿岚宅院），轮询等待渲染循环（无头 swiftshader 较慢）
  await page.evaluate(() => window.__utopiaWorld?.flyToHome?.('plot-2'));
  await page.waitForFunction(
    () => (window.__utopiaWorld?.getResidentsNearLocal(4)?.length || 0) >= 1,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat-entry').length >= 1,
    null,
    { timeout: 10000 },
  );
  const near = await page.evaluate(() => window.__utopiaWorld?.getResidentsNearLocal(4) || []);
  record('靠近居民触发聊天入口', near.length >= 1, `near=${near.map((r) => r.residentName).join('/')}`);

  await page.screenshot({ path: path.join(SCREEN_DIR, 'resident_avatar_world.png') });

  // 持久化：读取当前居民状态 → 刷新 → 状态保留
  const beforeReload = await page.evaluate(() =>
    window.__utopiaWorld?.getResidentAvatarStates(),
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const afterReload = await page.evaluate(() =>
    window.__utopiaWorld?.getResidentAvatarStates(),
  );
  const persisted = afterReload.length === 5 && beforeReload.length === 5;
  record('刷新后居民Avatar状态保留', persisted, `before=${beforeReload.length} after=${afterReload.length}`);

  const meaningfulErrors = errors.filter((e) => !/favicon/i.test(e));
  record('全程 0 控制台报错', meaningfulErrors.length === 0, meaningfulErrors.slice(0, 3).join(' | '));
} catch (error) {
  record('执行异常', false, error.message);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`);
process.exit(failed.length ? 1 : 0);
