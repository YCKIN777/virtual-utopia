#!/usr/bin/env node
/**
 * 【阶段二】聊天入口 + 距离判定 + @直聊 —— Playwright 无头 UI 自测。
 *
 * 依赖运行中的前端 dev server(5199) + phase5(3300) + phase6(3400)。
 * 覆盖验收：
 *   1. 距离判定坐标口径统一为 group.position（修复"贴近却判定 >4m"）
 *   2. 走近居民（≤4m）→ 屏幕下方弹「与 X 交谈」按钮
 *   3. 点击某户暖灯/木牌 → 直接打开与该户主居民的聊天面板
 *   4. 世界聊天框输入 @ → 弹出 5 位居民列表 → 选谁和谁聊
 *   5. 发送消息 → 居民回复
 *   6. 未登录发送 → 友好提示「请先登录再与居民交谈」
 *   7. 全程 0 控制台报错
 *
 * 说明：
 *  - 仓库 db 中 traveler 口令按「明文 scrypt」存储，而前端会先做 SHA-256 再提交，
 *    故 localhost 安全上下文下 UI 登录会落到离线演示态（无 token）。为端到端验证
 *    "带真实 token 的私聊回复"，这里用 REST 取真 token 注入会话。
 *  - swiftshader 下页面主线程极重，Playwright 的 actionability click 会挂起，
 *    因此 DOM 交互统一用原始鼠标输入（page.mouse）。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const API = process.env.API_URL || 'http://localhost:3400';
const TOKEN_KEY = 'virtual-utopia.phase5.token';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

const loginToken = async () => {
  const res = await fetch(`${API}/api/phase6/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'traveler', password: 'utopia2026' }),
  });
  const json = await res.json();
  if (!json?.token) throw new Error('登录失败: ' + JSON.stringify(json));
  return json.token;
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const safeShot = async (page, name) => {
  try {
    await page.screenshot({
      path: path.join(SCREEN_DIR, name),
      animations: 'disabled',
      timeout: 60000,
    });
  } catch {
    /* 截图非验收必需（模型不可读图） */
  }
};

const waitWorld = async (page) => {
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
};

// 原始鼠标点击（绕过 actionability，规避 swiftshader 主线程卡顿）
const mouseClick = async (page, locator) => {
  const loc = typeof locator === 'string' ? page.locator(locator) : locator;
  const box = await loc.first().boundingBox();
  if (!box) throw new Error('no bounding box: ' + String(locator));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

// 点击输入框后原始键入（含中文走 insertText）
const typeInto = async (page, selector, text) => {
  await mouseClick(page, page.locator(selector));
  await page.keyboard.type(text, { delay: 15 });
};

// 把相机摆到能看见某户屋顶暖灯的位置，返回暖灯命中柱中心的屏幕坐标
const aimBeacon = async (page, plotId) => {
  await page.evaluate((id) => {
    const w = window.__utopiaWorld;
    const p = w.residentBeacons.get(id).group.position;
    w.controls.target.set(p.x, p.y, p.z);
    w.camera.position.set(p.x + 7, p.y + 8, p.z + 9);
    w.camera.lookAt(p.x, p.y + 1.2, p.z);
    w.camera.updateMatrixWorld(true);
    if (w.controls.update) w.controls.update();
  }, plotId);
  await page.waitForTimeout(900);
  return page.evaluate((id) => {
    const w = window.__utopiaWorld;
    const p = w.residentBeacons.get(id).group.position.clone();
    p.y += 1.35;
    const v = p.project(w.camera);
    const rect = w.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }, plotId);
};

// 真实鼠标点击某户暖灯/木牌（命中 3D 场景内的可点击网格）
const clickBeacon = async (page, plotId) => {
  const pt = await aimBeacon(page, plotId);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
};

// 关闭居民聊天面板（重试直至卸载，规避主线程卡顿导致的偶发不生效）
const closeResidentPanel = async (page) => {
  for (let i = 0; i < 12; i += 1) {
    const count = await page.evaluate(() => {
      document.querySelector('.vu-resident-chat__close')?.click();
      return document.querySelectorAll('.vu-resident-chat').length;
    });
    if (count === 0) return true;
    await page.waitForTimeout(400);
  }
  return (await page.locator('.vu-resident-chat').count()) === 0;
};

// 清除历史测试消息，保证用例可重复、不污染用户存档
const TEST_STRINGS = ['你好呀，晚上好', '在吗'];
const purgeTestMessages = async (page) => {
  await page
    .evaluate(async (testStrings) => {
      const s = window.__utopiaStore;
      if (!s) return;
      const chats = s.state.residentChats || {};
      const filtered = {};
      Object.entries(chats).forEach(([key, list]) => {
        const kept = (list || []).filter(
          (m) => !testStrings.includes(m.content),
        );
        if (kept.length) filtered[key] = kept;
      });
      s.state.residentChats = filtered;
      if (s.persistNow) await s.persistNow();
    }, TEST_STRINGS)
    .catch(() => {});
};

// ---------------- 登录态上下文 ----------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const token = await loginToken();
await ctx.addInitScript(
  ([k, t]) => {
    try {
      sessionStorage.setItem(k, t);
    } catch {
      /* ignore */
    }
  },
  [TOKEN_KEY, token],
);
const page = await ctx.newPage();
const errors = [];
const chatResponses = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  // 只记状态码，绝不读取 body（读 body 会与页面自身的 response.json() 竞争，
  // 导致 payload 变 null、回复落不进 store）。
  if (r.url().includes('/chat/resident')) {
    chatResponses.push(String(r.status()));
  }
});

try {
  await page.goto(`${WORLD}/#/world`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitWorld(page);
  await purgeTestMessages(page);

  // 0) 登录态成立
  record(
    '已建立登录会话（世界频道入口可见）',
    (await page.locator('.vu-world-chat__trigger').count()) >= 1,
  );

  // 1) 距离口径修复：getLocalAvatarState 取实际渲染坐标 group.position
  const coord = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const rec = w.avatarObjects.get(w.localAvatarId);
    if (!rec) return null;
    rec.group.position.set(111, 3, 222);
    rec.targetPosition.set(-111, 3, -222);
    const st = w.getLocalAvatarState();
    return { x: st.x, z: st.z };
  });
  record(
    '距离口径统一为实际渲染坐标 group.position',
    Boolean(coord) &&
      Math.abs(coord.x - 111) < 1e-6 &&
      Math.abs(coord.z - 222) < 1e-6,
    JSON.stringify(coord),
  );

  // 2) 贴近判定：玩家渲染坐标贴到墨竹脚边 → near-residents 命中墨竹
  const near = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const mozhu = w
      .getResidentAvatarStates()
      .find((r) => r.residentName === '墨竹');
    const rec = w.avatarObjects.get(w.localAvatarId);
    rec.group.position.set(mozhu.x + 1.2, mozhu.y, mozhu.z + 0.6);
    rec.targetPosition.set(mozhu.x + 1.2, mozhu.y, mozhu.z + 0.6);
    w.controls.target.set(mozhu.x, mozhu.y, mozhu.z);
    return w
      .getResidentsNearLocal(4)
      .map((r) => ({ name: r.residentName, d: +r.distance.toFixed(2) }));
  });
  record(
    '站在墨竹脚边时 near-residents 命中墨竹（≤4m）',
    near.some((r) => r.name === '墨竹'),
    JSON.stringify(near),
  );

  // 3) 屏幕下方稳定弹出「与墨竹交谈」按钮
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('.vu-resident-chat-entry button');
      return Boolean(btn) && btn.textContent.includes('墨竹');
    },
    null,
    { timeout: 20000, polling: 300 },
  );
  record('屏幕下方弹出「与墨竹交谈」按钮', true);
  await safeShot(page, 'phase2_chat_entry_button.png');

  // 4) 点击墨竹家的暖灯/木牌 → 直接打开与墨竹的聊天面板
  await clickBeacon(page, 'plot-48');
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat').length >= 1,
    null,
    { timeout: 10000 },
  );
  const nameFromClick = (
    await page.locator('.vu-resident-chat__meta strong').first().textContent()
  ).trim();
  record(
    '点击墨竹家的暖灯/木牌 → 直接打开墨竹聊天面板',
    nameFromClick === '墨竹',
    'panel=' + nameFromClick,
  );
  await safeShot(page, 'phase2_beacon_click_chat.png');

  await closeResidentPanel(page);

  // 5) 世界聊天框输入 @ → 弹出 5 位居民列表
  await mouseClick(page, page.locator('.vu-world-chat__trigger'));
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-world-chat__panel').length >= 1,
    null,
    { timeout: 8000 },
  );
  await typeInto(page, '.vu-world-chat__panel input', '@');
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-world-chat__mention').length >= 5,
    null,
    { timeout: 8000 },
  );
  const mentionNames = (
    await page.locator('.vu-world-chat__mention').allInnerTexts()
  ).map((t) => t.trim());
  record(
    '聊天框输入 @ 弹出 5 位居民列表',
    mentionNames.length === 5,
    mentionNames.join('/'),
  );
  await safeShot(page, 'phase2_at_mention_list.png');

  // 6) 选「墨竹」→ 直接打开墨竹私聊
  await mouseClick(page, page.locator('.vu-world-chat__mention', { hasText: '墨竹' }));
  await page.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat').length >= 1,
    null,
    { timeout: 10000 },
  );
  const nameFromMention = (
    await page.locator('.vu-resident-chat__meta strong').first().textContent()
  ).trim();
  record(
    '@ 选墨竹 → 直接打开墨竹一对一会话',
    nameFromMention === '墨竹',
    nameFromMention,
  );

  // 收起世界频道，减轻主线程负担，避免拖慢私聊回复渲染
  await page.evaluate(() => {
    document.querySelector('.vu-world-chat__trigger')?.click();
  });
  await page
    .waitForFunction(
      () => document.querySelectorAll('.vu-world-chat__panel').length === 0,
      null,
      { timeout: 5000 },
    )
    .catch(() => {});

  // 7) 发送消息 → 收到居民回复（真实 LLM，可能 5~15s；轮询并收集期间出现的 toast）
  const beforeUser = await page.evaluate(
    () => document.querySelectorAll('.vu-resident-chat__message.is-user').length,
  );
  await typeInto(page, '.vu-resident-chat__input input', '你好呀，晚上好');
  await mouseClick(page, page.locator('.vu-resident-chat__input button'));
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('.vu-resident-chat__message.is-user').length > n,
    beforeUser,
    { timeout: 20000 },
  );

  const seenToasts = new Set();
  let replyOk = false;
  let lastSnap = null;
  for (let i = 0; i < 200 && !replyOk; i += 1) {
    const snap = await page.evaluate(() => ({
      reply: [
        ...document.querySelectorAll(
          '.vu-resident-chat__message.is-assistant .vu-resident-chat__bubble',
        ),
      ].some(
        (el) =>
          !el.classList.contains('is-typing') &&
          el.textContent.trim().length > 0,
      ),
      toasts: [...document.querySelectorAll('.vu-toast')].map((el) =>
        el.textContent.trim().slice(0, 40),
      ),
      typing: document.querySelectorAll('.vu-resident-chat__bubble.is-typing')
        .length,
      header: document
        .querySelector('.vu-resident-chat__meta strong')
        ?.textContent?.trim(),
      msgCount: document.querySelectorAll('.vu-resident-chat__message').length,
      listText: document
        .querySelector('.vu-resident-chat__list')
        ?.innerText?.replace(/\s+/g, ' ')
        .slice(0, 160),
      store: (() => {
        const s = window.__utopiaStore;
        if (!s) return 'no-store-hook';
        const chats = s.state.residentChats || {};
        return {
          hasToken: Boolean(s.getAuthToken && s.getAuthToken()),
          keys: Object.keys(chats),
          mozhuRoles: (chats['墨竹'] || []).map((m) => m.role),
        };
      })(),
    }));
    snap.toasts.forEach((t) => seenToasts.add(t));
    lastSnap = snap;
    replyOk = snap.reply;
    if (!replyOk) await page.waitForTimeout(500);
  }
  record(
    '发送消息后收到墨竹回复',
    replyOk,
    `chatResponses=${JSON.stringify(chatResponses)} toasts=${JSON.stringify([
      ...seenToasts,
    ])} last=${JSON.stringify(lastSnap)}`,
  );
  await safeShot(page, 'phase2_resident_reply.png');
  await purgeTestMessages(page);

  const meaningful = errors.filter((e) => !/favicon/i.test(e));
  record(
    '登录态全程 0 控制台报错',
    meaningful.length === 0,
    meaningful.slice(0, 2).join(' | '),
  );
} catch (error) {
  const diag = await page
    .evaluate(() => ({
      toasts: [...document.querySelectorAll('.vu-toast')].map((el) =>
        el.textContent.slice(0, 60),
      ),
      typing: document.querySelectorAll('.vu-resident-chat__bubble.is-typing')
        .length,
      panels: document.querySelectorAll('.vu-resident-chat').length,
      header: document
        .querySelector('.vu-resident-chat__meta strong')
        ?.textContent?.trim(),
      msgCount: document.querySelectorAll('.vu-resident-chat__message').length,
      assistantCount: document.querySelectorAll(
        '.vu-resident-chat__message.is-assistant',
      ).length,
      listText: document
        .querySelector('.vu-resident-chat__list')
        ?.innerText?.slice(0, 200),
      store: (() => {
        const s = window.__utopiaStore;
        if (!s) return 'no-store-hook';
        const chats = s.state.residentChats || {};
        return {
          hasToken: Boolean(s.getAuthToken && s.getAuthToken()),
          keys: Object.keys(chats),
          mozhuRoles: (chats['墨竹'] || []).map((m) => m.role),
        };
      })(),
    }))
    .catch(() => null);
  record(
    '登录态执行异常',
    false,
    `${error.message} | chatResponses=${JSON.stringify(chatResponses)} | diag=${JSON.stringify(diag)}`,
  );
} finally {
  await ctx.close();
}

// ---------------- 未登录（匿名）上下文 ----------------
try {
  const anon = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const anonErrors = [];
  const anonPage = await anon.newPage();
  anonPage.on('console', (m) => {
    if (m.type() === 'error') anonErrors.push(m.text());
  });
  await anonPage.goto(`${WORLD}/#/world`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await waitWorld(anonPage);

  record(
    '未登录：世界频道入口不显示',
    (await anonPage.locator('.vu-world-chat__trigger').count()) === 0,
  );

  await clickBeacon(anonPage, 'plot-48');
  await anonPage.waitForFunction(
    () => document.querySelectorAll('.vu-resident-chat').length >= 1,
    null,
    { timeout: 10000 },
  );
  await typeInto(anonPage, '.vu-resident-chat__input input', '在吗');
  await mouseClick(anonPage, anonPage.locator('.vu-resident-chat__input button'));
  await anonPage.waitForFunction(
    () =>
      [...document.querySelectorAll('.vu-toast')].some((el) =>
        el.textContent.includes('请先登录再与居民交谈'),
      ),
    null,
    { timeout: 10000 },
  );
  record('未登录发送 → 弹出「请先登录再与居民交谈」提示', true);
  await safeShot(anonPage, 'phase2_need_login_toast.png');

  const anonMeaningful = anonErrors.filter((e) => !/favicon/i.test(e));
  record(
    '匿名全程 0 控制台报错',
    anonMeaningful.length === 0,
    anonMeaningful.slice(0, 2).join(' | '),
  );
  await anon.close();
} catch (error) {
  record('匿名态执行异常', false, error.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`,
);
process.exit(failed.length ? 1 : 0);
