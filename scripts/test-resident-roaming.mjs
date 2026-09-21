#!/usr/bin/env node
/**
 * 【阶段三】居民漫游自然化 —— Playwright 无头自测。
 *
 * 依赖运行中的前端 dev server(5199) + phase5(3300) + phase6(3400)。
 * 覆盖验收（确定性数值仿真，不依赖无头渲染帧率）：
 *   1. 宅院漫游半径放宽到 ~5.5m
 *   2. 居民步行速度被限速（不会"瞬间窜点"），且远低于玩家 9m/s（追得上）
 *   3. 静止停留期间零位移（不存在"静立滑行/弹球"）
 *   4. 到达后停留时长落在 8~15s
 *   5. 玩家贴近时居民保持停留、不窜走
 *   6. 全程 0 控制台报错
 *
 * 登录说明同 test-resident-chat-entry.mjs：用 REST 取真 token 注入会话，
 * 以便存在"本地玩家"来验证贴近停留。
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const safeShot = async (name) => {
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

try {
  await page.goto(`${WORLD}/#/world`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  await safeShot('phase3_roaming_before_sim.png');

  // ---- 1) 漫游半径 / 宅院锚点 ----
  const config = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const list = [];
    for (const rec of w.avatarObjects.values()) {
      if (!rec.isResident) continue;
      const r = rec.roaming;
      const span = r.bounds ? r.bounds.maxX - r.bounds.minX : null;
      list.push({
        name: rec.residentName,
        radius: r.radius ?? null,
        span,
        hasHome: Boolean(r.home),
      });
    }
    return list;
  });
  record(
    '5 位居民均带宅院锚点 + 半径 5.5m',
    config.length === 5 &&
      config.every((c) => c.hasHome && Math.abs(c.radius - 5.5) < 0.001),
    JSON.stringify(config.map((c) => `${c.name}:r=${c.radius}`)),
  );

  // ---- 2~4) 确定性仿真：限速 / 静止零位移 / 停留时长 ----
  const sim = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    w.running = false; // 冻结 rAF 循环，改用手动固定步长推进（确定性）

    // 把本地玩家挪到很远，避免触发"贴近停留"
    const local = w.avatarObjects.get(w.localAvatarId);
    if (local) {
      local.group.position.set(-999, 0, -999);
      local.targetPosition.copy(local.group.position);
    }

    const dt = 1 / 60;
    const seconds = 12;
    const out = [];

    for (const rec of w.avatarObjects.values()) {
      if (!rec.isResident) continue;

      const home = rec.roaming.home;
      // 复位：站在宅院中心，目标设在半径上（5.5m 外），清空停留
      rec.group.position.x = home.x;
      rec.group.position.z = home.z;
      rec.targetPosition.x = home.x + 5.5;
      rec.targetPosition.z = home.z;
      rec.roaming.idleTimer = 0;
      rec.animationState = 'walk';

      let maxWalkStep = 0;
      let maxIdleStep = 0;
      let maxIdleTimer = 0;
      let sawWalk = false;
      let sawIdle = false;
      let prevX = rec.group.position.x;
      let prevZ = rec.group.position.z;

      for (let i = 0; i < seconds / dt; i += 1) {
        w.updateRoamingAgents(dt);
        w.animateAvatars(0, dt);

        const step = Math.hypot(
          rec.group.position.x - prevX,
          rec.group.position.z - prevZ,
        );

        if (rec.animationState === 'walk') {
          sawWalk = true;
          maxWalkStep = Math.max(maxWalkStep, step);
        } else {
          sawIdle = true;
          maxIdleStep = Math.max(maxIdleStep, step);
          maxIdleTimer = Math.max(maxIdleTimer, rec.roaming.idleTimer);
        }

        prevX = rec.group.position.x;
        prevZ = rec.group.position.z;
      }

      out.push({
        name: rec.residentName,
        walkSpeed: maxWalkStep / dt,
        idleGlideSpeed: maxIdleStep / dt,
        idleTimer: maxIdleTimer,
        sawWalk,
        sawIdle,
      });
    }
    return out;
  });

  const maxWalk = Math.max(...sim.map((s) => s.walkSpeed));
  const maxIdleGlide = Math.max(...sim.map((s) => s.idleGlideSpeed));
  const idleMin = Math.min(...sim.map((s) => s.idleTimer));
  const idleMax = Math.max(...sim.map((s) => s.idleTimer));

  record(
    '居民步行被限速（≤1.7m/s，不窜点）且远低于玩家 9m/s',
    maxWalk <= 1.72 && maxWalk >= 1.2 && maxWalk < 9,
    `maxWalk=${maxWalk.toFixed(3)}m/s`,
  );
  record(
    '静止停留期间零位移（不存在静立滑行/弹球）',
    maxIdleGlide <= 0.02,
    `maxIdleGlide=${maxIdleGlide.toFixed(4)}m/s`,
  );
  record(
    '到达后停留时长 ∈ [8,15]s',
    idleMin >= 7.9 && idleMax <= 15.01 && idleMin > 0,
    `idle=[${idleMin.toFixed(2)}, ${idleMax.toFixed(2)}]s`,
  );
  record(
    '仿真中确实走了也停了（走过 + 停过）',
    sim.every((s) => s.sawWalk && s.sawIdle),
    JSON.stringify(sim.map((s) => `${s.name}:walk=${s.walkSpeed.toFixed(2)} idle=${s.idleTimer.toFixed(1)}`)),
  );

  // ---- 5) 玩家贴近时保持停留、不窜走 ----
  const pause = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const dt = 1 / 60;
    const rec = [...w.avatarObjects.values()].find((r) => r.isResident);
    const home = rec.roaming.home;
    const local = w.avatarObjects.get(w.localAvatarId);

    // 居民准备走向 5.5m 外的点
    rec.group.position.x = home.x;
    rec.group.position.z = home.z;
    rec.targetPosition.x = home.x + 5.5;
    rec.targetPosition.z = home.z;
    rec.roaming.idleTimer = 0;
    rec.animationState = 'walk';

    // 玩家贴到居民旁边 2m
    local.group.position.x = home.x + 2;
    local.group.position.z = home.z;
    local.targetPosition.copy(local.group.position);

    w.updateRoamingAgents(dt);
    const stateAfterPause = rec.animationState;
    const idleAfterPause = rec.roaming.idleTimer;

    const startX = rec.group.position.x;
    const startZ = rec.group.position.z;
    for (let i = 0; i < 3 / dt; i += 1) {
      w.updateRoamingAgents(dt);
      w.animateAvatars(0, dt);
    }
    const moved = Math.hypot(
      rec.group.position.x - startX,
      rec.group.position.z - startZ,
    );

    return { stateAfterPause, idleAfterPause, moved };
  });
  record(
    '玩家贴近时居民保持停留、不窜走',
    pause.stateAfterPause === 'idle' &&
      pause.idleAfterPause > 0 &&
      pause.moved <= 0.02,
    JSON.stringify(pause),
  );

  // ---- 6) 路点采样：始终落在宅院 5~6m 半径内 ----
  const sampling = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const rec = [...w.avatarObjects.values()].find((r) => r.isResident);
    const home = rec.roaming.home;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < 400; i += 1) {
      w.pickRoamingWaypoint(rec);
      const d = Math.hypot(
        rec.targetPosition.x - home.x,
        rec.targetPosition.z - home.z,
      );
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    return { min, max };
  });
  record(
    '漫游路点始终落在宅院 5~6m 半径内（不跑远）',
    sampling.max <= 5.55 && sampling.min >= 1.0,
    `range=[${sampling.min.toFixed(2)}, ${sampling.max.toFixed(2)}]m`,
  );

  const meaningful = errors.filter((e) => !/favicon/i.test(e));
  record(
    '全程 0 控制台报错',
    meaningful.length === 0,
    meaningful.slice(0, 2).join(' | '),
  );
} catch (error) {
  record('执行异常', false, error.message);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`,
);
process.exit(failed.length ? 1 : 0);
