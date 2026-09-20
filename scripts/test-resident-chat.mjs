#!/usr/bin/env node
/**
 * 居民 AI 一对一私聊 —— Playwright 无头 UI 自测。
 *
 * 依赖运行中的前端 dev server(5175) + phase5(3300) + phase6(3400)。
 * 验证：靠近触发交谈按钮、唤起/关闭弹窗、发送消息获带人设回复、200字符限制、
 *       会话隔离、持久化(快照 + 刷新保留)、控制台 0 报错；截图存 vu_screens/。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = 'http://localhost:5175';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

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

const waitWorld = async () => {
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
};

const login = async () => {
  await page.goto(`${WORLD}/#/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名').fill('traveler');
  await page.getByLabel('密码').fill('utopia2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/#\/profile/, { timeout: 15000 });
  await page.goto(`${WORLD}/#/world`, { waitUntil: 'domcontentloaded' });
  await waitWorld();
};

const flyAndWaitEntry = async (plotId, residentName) => {
  await page.evaluate((id) => window.__utopiaWorld?.flyToHome?.(id), plotId);
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.vu-resident-chat-entry button')].some(
        (el) => el.textContent.includes(name),
      ),
    residentName,
    { timeout: 45000 },
  );
};

const waitPanel = () =>
  page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat').length >= 1,
    null,
    { timeout: 10000 },
  );

try {
  await login();

  // 1) 靠近居民(阿岚/plot-2) → 交谈按钮显示
  await flyAndWaitEntry('plot-2', '阿岚');
  record('靠近居民(≤4m)显示交谈按钮', true);

  // 2) 点击交谈 → 弹窗唤起 + 展示名称
  await page.locator('.vu-resident-chat-entry button', { hasText: '阿岚' }).click();
  await waitPanel();
  record('点击交谈唤起一对一弹窗', true);
  record(
    '弹窗展示居民名称',
    (await page.locator('.vu-resident-chat__meta strong').textContent()).trim() === '阿岚',
  );

  // 3) 空消息拦截 + 200 字符限制
  record(
    '空消息发送按钮禁用',
    await page.locator('.vu-resident-chat__input button').isDisabled(),
  );
  record(
    '输入框 maxlength=200',
    (await page.locator('.vu-resident-chat__input input').getAttribute('maxlength')) === '200',
  );

  // 4) 发送消息 → 居民带人设回复
  await page.locator('.vu-resident-chat__input input').fill('你好，介绍一下你家的庭院风景吧');
  await page.locator('.vu-resident-chat__input button').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat__message.is-user').length >= 1,
    null,
    { timeout: 10000 },
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.vu-resident-chat__message.is-assistant .vu-resident-chat__bubble')].some(
        (el) => el.textContent.trim().length > 0,
      ),
    null,
    { timeout: 45000 },
  );
  record('居民返回带人设回复', true);

  await page.screenshot({ path: path.join(SCREEN_DIR, 'resident_chat_dialog.png') });

  // 5) 关闭弹窗
  await clickBySelector('.vu-resident-chat__close');
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat').length === 0,
    null,
    { timeout: 5000 },
  );
  record('弹窗可关闭', true);

  // 6) 会话隔离 + 持久化（直接读 world-session 快照）
  await page.waitForTimeout(4000);
  const snapshotInfo = await page.evaluate(async () => {
    const token = sessionStorage.getItem('virtual-utopia.phase5.token');
    const res = await fetch('/phase6-api/api/phase6/world-state', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json();
    const chats = payload?.snapshot?.residentChats || {};
    return { chats, keys: Object.keys(chats) };
  });
  record(
    '对话记录持久化到快照(阿岚 ≥2 条)',
    (snapshotInfo.chats['阿岚'] || []).length >= 2,
  );
  record(
    '会话隔离(仅阿岚，无其他居民)',
    snapshotInfo.keys.length === 1 && snapshotInfo.keys[0] === '阿岚',
  );

  // 7) 刷新后历史保留
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitWorld();
  await flyAndWaitEntry('plot-2', '阿岚');
  await page.locator('.vu-resident-chat-entry button', { hasText: '阿岚' }).click();
  await waitPanel();
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat__message.is-user').length >= 1,
    null,
    { timeout: 10000 },
  );
  record('刷新后居民聊天记录保留', true);

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
