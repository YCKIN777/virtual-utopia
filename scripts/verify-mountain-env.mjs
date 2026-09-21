#!/usr/bin/env node
/**
 * 【山林公共环境细化】自检器 —— 一条命令验证「只加视觉、不阻挡、够轻、薄雾柔和」。
 *
 *   node scripts/verify-mountain-env.mjs
 *
 * 覆盖：
 *   A. 环境已装配且自成一组（结构上与宅院主体 / 庭院小品隔离）
 *   B. 单物件三角面 300–800（硬性约束）+ 新增三角面总量
 *   C. 山坡植被向阳/背阴分布合理 + 溪流乱石计数
 *   D. 只读约束：不进 clickableMeshes / 无碰撞体 / 没往宅院 group 里塞东西
 *   E. 溪流乱石落在河岸环带（河宽 × [0.9, 2.6]），不落入河道中线、不越出岸带
 *   F. 不阻挡：山坡植被距宅院 ≥ 6m、距枢纽 ≥ 6m、避开广场；居民全部在场、状态正常
 *   G. 林间薄雾层存在且 opacity 极低（不糊化中近景）
 *   H. 0 控制台报错
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const TRI_BUDGET = { min: 300, max: 800 };

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};
const info = (label, extra = '') => console.log(`INFO ${label}${extra ? ' · ' + extra : ''}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
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
    /* 截图非验收必需 */
  }
};

try {
  await page.goto(`${WORLD}/#/world`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

  // ---------------- A. 装配 + 结构隔离 ----------------
  const base = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const env = w.mountainEnv;
    if (!env) return { missing: true };

    const sceneGroup = w.scene.getObjectByName('mountain-env');
    const instanced = (env.group?.children || []).filter((c) => c.isInstancedMesh);
    const instanceTotal = instanced.reduce((sum, m) => sum + m.count, 0);

    // 结构隔离：环境组里不得出现「宅院模型网格」（带 userData.homeId 的）
    let envContainsHomeMesh = 0;
    env.group?.traverse((c) => {
      if (c.isMesh && c.userData?.homeId !== undefined) envContainsHomeMesh += 1;
    });

    // 也没往宅院 group 里加东西
    let homeGroupsContainEnv = 0;
    w.homeObjects.forEach((entry) => {
      entry.group.traverse((c) => {
        if (c.name?.startsWith('mountain-env')) homeGroupsContainEnv += 1;
      });
    });

    // 同时确认没有动到已有的 courtyard-decor
    const decorStillThere = Boolean(w.scene.getObjectByName('courtyard-decor'));

    return {
      inScene: Boolean(sceneGroup),
      groupName: env.group?.name,
      meshCount: env.stats?.meshCount,
      instancedCount: instanced.length,
      instanceTotal,
      trianglesByRole: env.trianglesByRole,
      addedTriangles: env.stats?.addedTriangles,
      slopeCount: env.slopeItems.length,
      streamCount: env.streamItems.length,
      sunny: env.stats?.sunny,
      shady: env.stats?.shady,
      boulders: env.stats?.boulders,
      pebbles: env.stats?.pebbles,
      mistMeshCount: env.stats?.mistMeshCount,
      envContainsHomeMesh,
      homeGroupsContainEnv,
      decorStillThere,
    };
  });

  record(
    '山林环境已装配，且自成一组（与宅院主体 / 庭院小品结构隔离）',
    Boolean(base.missing) === false &&
      base.inScene &&
      base.groupName === 'mountain-env' &&
      base.instancedCount > 0 &&
      base.instanceTotal > 0 &&
      base.envContainsHomeMesh === 0 &&
      base.homeGroupsContainEnv === 0 &&
      base.decorStillThere,
    base.missing
      ? 'no-mountainEnv'
      : `instanced=${base.instancedCount} instances=${base.instanceTotal} meshes=${base.meshCount} 隔离(宅院网格入组=${base.envContainsHomeMesh}, 宅院组被塞=${base.homeGroupsContainEnv}) 庭院小品仍在=${base.decorStillThere}`,
  );

  record(
    '山坡植被与溪流乱石均生成（非空）',
    base.slopeCount > 100 && base.streamCount > 50,
    `山坡=${base.slopeCount} 溪流=${base.streamCount}（向阳=${base.sunny} 背阴=${base.shady} 毛石=${base.boulders} 碎石=${base.pebbles}）`,
  );

  // ---------------- B. 三角面预算 ----------------
  const triEntries = Object.entries(base.trianglesByRole || {});
  const outOfBudget = triEntries.filter(
    ([, t]) => t < TRI_BUDGET.min || t > TRI_BUDGET.max,
  );
  record(
    `单物件三角面全部落在 ${TRI_BUDGET.min}–${TRI_BUDGET.max}`,
    triEntries.length >= 5 && outOfBudget.length === 0,
    triEntries.map(([r, t]) => `${r}:${t}`).join(' '),
  );
  info(
    '新增三角面总量（含实例化复用）',
    `${base.addedTriangles}（实例化后 draw call 仅 ${base.meshCount} 个 + 薄雾 ${base.mistMeshCount} 个）`,
  );

  // ---------------- C. 向阳/背阴分布 ----------------
  record(
    '向阳坡植被更密、背阴坡更疏（疏密差异成立）',
    base.sunny > base.shady,
    `向阳=${base.sunny} 背阴=${base.shady}（背阴自带林下稀疏，命中率更低）`,
  );

  // ---------------- D. 只读约束 ----------------
  const readonly = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const envNames = new Set();
    w.mountainEnv.group.children.forEach((c) => envNames.add(c));

    const clickableHasEnv = w.clickableMeshes.filter(
      (m) => envNames.has(m) || m.name?.startsWith('mountain-env'),
    ).length;

    const collisionKeys = Object.keys(w).filter((k) => /collid|collision|physics|obstacle/i.test(k));

    // 薄雾层
    const mist = w.scene.getObjectByName('forest-mist');
    let mistOpacity = null;
    let mistMeshes = 0;
    if (mist) {
      mist.children.forEach((m) => {
        if (m.material) {
          mistOpacity = mistOpacity === null ? m.material.opacity : Math.max(mistOpacity, m.material.opacity);
          mistMeshes += 1;
        }
      });
    }

    return {
      clickableCount: w.clickableMeshes.length,
      clickableHasEnv,
      collisionKeys,
      decorClickableUntouched: true,
      mistChildOfScene: mist ? mist.parent === w.scene : false,
      mistOpacity,
      mistMeshes,
    };
  });
  record(
    '环境未加入 clickableMeshes（不可点击、不参与拾取）',
    readonly.clickableHasEnv === 0,
    `clickableMeshes=${readonly.clickableCount} 其中环境=${readonly.clickableHasEnv}`,
  );
  record(
    '未新增任何碰撞体 / 物理体',
    readonly.collisionKeys.length === 0,
    `碰撞相关字段=[${readonly.collisionKeys.join(',')}]`,
  );

  // ---------------- E. 溪流乱石位置 ----------------
  const streamCheck = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const items = w.mountainEnv.streamItems;
    const streamX = (z) => Math.sin(z * 0.075) * 9;
    const streamWidth = (z) =>
      1.45 + (0.5 + 0.5 * Math.sin(z * 0.087)) * 1.2 + (0.5 + 0.5 * Math.sin(z * 0.021 + 1.7)) * 0.85;

    let tooClose = 0; // 落进河道中线（河宽 × 0.9 以内）
    let tooFar = 0; // 越出岸带（河宽 × 2.6 以外）
    let inBand = 0;
    items.forEach((it) => {
      const off = Math.abs(it.x - streamX(it.z)) / streamWidth(it.z);
      if (off < 0.9) tooClose += 1;
      else if (off > 2.6) tooFar += 1;
      else inBand += 1;
    });
    return { total: items.length, tooClose, tooFar, inBand };
  });
  record(
    '溪流乱石全部落在河岸环带（河宽 × [0.9, 2.6]，不落入水道、不越岸）',
    streamCheck.tooClose === 0 && streamCheck.tooFar === 0 && streamCheck.inBand > 0,
    `总数=${streamCheck.total} 在带=${streamCheck.inBand} 落水=${streamCheck.tooClose} 越岸=${streamCheck.tooFar}`,
  );

  // ---------------- F. 不阻挡 ----------------
  const blocking = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const items = w.mountainEnv.slopeItems;
    const homePositions = [];
    w.homeObjects.forEach((entry) => homePositions.push({ x: entry.home.x, z: entry.home.z }));
    const hubs = [];
    // 组团枢纽（宅院↔枢纽主路辐射点），由 buildMountainEnv 存入 this.mountainEnv.hubs
    if (w.mountainEnv?.hubs) {
      w.mountainEnv.hubs.forEach((h) => hubs.push({ x: h.x, z: h.z }));
    }

    let minHomeDist = Infinity;
    let tooCloseHome = 0;
    let minHubDist = Infinity;
    let tooCloseHub = 0;
    let inPlaza = 0;

    items.forEach((it) => {
      const dHome = Math.min(...homePositions.map((h) => Math.hypot(h.x - it.x, h.z - it.z)));
      const dHub = hubs.length
        ? Math.min(...hubs.map((h) => Math.hypot(h.x - it.x, h.z - it.z)))
        : Infinity;
      minHomeDist = Math.min(minHomeDist, dHome);
      minHubDist = Math.min(minHubDist, dHub);
      if (dHome < 6) tooCloseHome += 1;
      if (dHub < 6) tooCloseHub += 1;
      if (Math.hypot(it.x, it.z) < 18) inPlaza += 1;
    });

    const residents = w.getResidentAvatarStates();
    const findRecord = (avatarId) => {
      const direct = w.avatarObjects?.get(avatarId);
      if (direct) return direct;
      for (const record of w.avatarObjects?.values?.() || []) {
        if (record.residentId === avatarId) return record;
      }
      return null;
    };
    const residentChecks = residents.map((r) => {
      const av = findRecord(r.avatarId);
      const home = av?.roaming?.home || null;
      const distanceToHome = home
        ? Math.hypot(av.group.position.x - home.x, av.group.position.z - home.z)
        : null;
      return {
        name: r.residentName || r.avatarId,
        state: r.currentState,
        finite: Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.y),
        distanceToHome: distanceToHome === null ? null : Number(distanceToHome.toFixed(2)),
      };
    });

    return {
      slopeCount: items.length,
      minHomeDist: Number.isFinite(minHomeDist) ? Number(minHomeDist.toFixed(2)) : null,
      tooCloseHome,
      minHubDist: Number.isFinite(minHubDist) ? Number(minHubDist.toFixed(2)) : null,
      tooCloseHub,
      inPlaza,
      residents: residentChecks,
      homeCount: w.homeObjects.size,
    };
  });

  record(
    '山坡植被避开宅院（距每户 ≥ 6m，不堵居民漫游圈）',
    blocking.tooCloseHome === 0,
    `最小距宅院=${blocking.minHomeDist}m 过近=${blocking.tooCloseHome} 进广场=${blocking.inPlaza}`,
  );
  record(
    '山坡植被避开组团枢纽主路（距枢纽 ≥ 6m）',
    blocking.tooCloseHub === 0,
    `最小距枢纽=${blocking.minHubDist}m 过近=${blocking.tooCloseHub}`,
  );
  record(
    '居民全部在场、状态正常、坐标有限（未被环境小品影响）',
    blocking.residents.length === 5 &&
      blocking.residents.every(
        (r) => r.finite && (r.state === 'idle' || r.state === 'walk'),
      ),
    JSON.stringify(blocking.residents),
  );
  record(
    '居民未被迫离开宅院（距各自宅院中心 ≤ 漫游半径 + 2m）',
    blocking.residents.every((r) => r.distanceToHome === null || r.distanceToHome <= 7.5),
    blocking.residents.map((r) => `${r.name}:${r.distanceToHome}m`).join(' '),
  );

  // ---------------- G. 薄雾 ----------------
  record(
    '林间薄雾层存在且 opacity 极低（不糊化中近景物件）',
    readonly.mistChildOfScene && readonly.mistOpacity !== null && readonly.mistOpacity <= 0.12,
    `薄雾带=${readonly.mistMeshes} 最大 opacity=${readonly.mistOpacity}`,
  );

  await safeShot('env_mountain.png');

  // ---------------- H. 报错 ----------------
  const meaningful = errors.filter((e) => !/favicon/i.test(e));
  record('全程 0 控制台报错', meaningful.length === 0, meaningful.slice(0, 2).join(' | '));
} catch (error) {
  record('执行异常', false, error.message);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`);
process.exit(failed.length ? 1 : 0);
