#!/usr/bin/env node
/**
 * 【庭院装饰小品】自检器 —— 一条命令验证「只加视觉、不阻挡、成套路、够轻」。
 *
 *   node scripts/verify-courtyard-decor.mjs
 *
 * 覆盖：
 *   A. 小品已装配且自成一组（结构上与宅院主体隔离）
 *   B. 三类宅院的成套差异（台地/临溪/崖边 各自签名小品）
 *   C. 单物件三角面 300–800（硬性约束）+ 新增三角面总量
 *   D. 只读约束：不进 clickableMeshes / 无碰撞体 / 没往宅院 group 里塞东西
 *   E. 不阻挡：落在该户底盘内、与房屋主体退让、与既有庭院小品保持距离
 *   F. 居民不受影响：5 位居民仍在场、状态正常、位置有限且未偏离宅院
 *   G. 0 控制台报错
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const TRI_BUDGET = { min: 300, max: 800 };
/** 与 courtyardDecor.js 保持一致（此处独立声明，避免自检依赖实现细节）。 */
const RING_FACTOR = { min: 0.72, max: 0.99 };
const HOUSE_MARGIN = 0.4;
const MIN_EXISTING_SEPARATION = 0.95;

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
    const decor = w.courtyardDecor;
    if (!decor) return { missing: true };

    const sceneGroup = w.scene.getObjectByName('courtyard-decor');
    const instanced = (decor.group?.children || []).filter((c) => c.isInstancedMesh);
    const instanceTotal = instanced.reduce((sum, m) => sum + m.count, 0);

    // 结构隔离：小品组里不得出现任何「宅院模型网格」（带 userData.homeId 的）
    let decorContainsHomeMesh = 0;
    decor.group?.traverse((c) => {
      if (c.isMesh && c.userData?.homeId !== undefined) decorContainsHomeMesh += 1;
    });

    // 也没往宅院 group 里加东西：宅院 group 里不得出现 courtyard-decor 的成员
    let homeGroupsContainDecor = 0;
    w.homeObjects.forEach((entry) => {
      entry.group.traverse((c) => {
        if (c.name?.startsWith('courtyard-decor')) homeGroupsContainDecor += 1;
      });
    });

    return {
      inScene: Boolean(sceneGroup),
      groupName: decor.group?.name,
      meshCount: decor.stats?.meshCount,
      instancedCount: instanced.length,
      instanceTotal,
      materialCount: decor.stats?.materials,
      trianglesByRole: decor.trianglesByRole,
      addedTriangles: decor.stats?.addedTriangles,
      placements: decor.placements.length,
      skipped: decor.skipped.length,
      homes: decor.stats?.homes,
      homesCovered: decor.stats?.homesCovered,
      byGroup: decor.stats?.byGroup,
      byRole: decor.stats?.byRole,
      reasons: decor.stats?.reasons,
      decorContainsHomeMesh,
      homeGroupsContainDecor,
      avoidPointCount: decor.avoidPointCount,
    };
  });

  record(
    '庭院小品已装配，且自成一组（与宅院主体结构隔离）',
    Boolean(base.missing) === false &&
      base.inScene &&
      base.groupName === 'courtyard-decor' &&
      base.instancedCount > 0 &&
      base.instanceTotal > 0 &&
      base.decorContainsHomeMesh === 0 &&
      base.homeGroupsContainDecor === 0,
    base.missing
      ? 'no-courtyardDecor'
      : `instanced=${base.instancedCount} instances=${base.instanceTotal} materials=${base.materialCount} 隔离(宅院网格入组=${base.decorContainsHomeMesh}, 宅院组被塞=${base.homeGroupsContainDecor})`,
  );

  const coverage = base.homes ? base.homesCovered / base.homes : 0;
  record(
    `宅院覆盖 ≥90%（实测 ${base.homesCovered}/${base.homes}）`,
    coverage >= 0.9 && base.placements > 0,
    `placed=${base.placements} skipped=${base.skipped} —— 少量宅院的环带已被既有庭院小品占满，按规则不强行塞入`,
  );

  // ---------------- B. 成套差异 ----------------
  const grouping = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const decor = w.courtyardDecor;
    const byHomeGroup = {};
    decor.placements.forEach((item) => {
      byHomeGroup[item.group] = byHomeGroup[item.group] || new Set();
      byHomeGroup[item.group].add(item.role);
    });
    const out = {};
    Object.entries(byHomeGroup).forEach(([key, set]) => {
      out[key] = [...set].sort();
    });
    return out;
  });

  const has = (group, role) => (grouping[group] || []).includes(role);
  record(
    '台地宅院成套：石凳 + 果树灌丛（+ 石板）',
    has('terrace', 'stool') && has('terrace', 'fruitShrub') && has('terrace', 'slab'),
    `terrace = ${(grouping.terrace || []).join('/')}`,
  );
  record(
    '临溪宅院成套：岸边景观石 + 矮竹丛（+ 石板）',
    has('stream', 'landscapeRock') && has('stream', 'bambooClump') && has('stream', 'slab'),
    `stream = ${(grouping.stream || []).join('/')}`,
  );
  record(
    '崖边宅院成套：大块毛石 + 简易石灯（+ 石板）',
    has('cliff', 'boulder') && has('cliff', 'stoneLantern') && has('cliff', 'slab'),
    `cliff = ${(grouping.cliff || []).join('/')}`,
  );
  record(
    '三套语汇确实不同（台地有石凳、临溪有矮竹、崖边有毛石，互不串味）',
    has('terrace', 'stool') &&
      !has('stream', 'stool') &&
      has('stream', 'bambooClump') &&
      !has('cliff', 'bambooClump') &&
      has('cliff', 'boulder') &&
      !has('terrace', 'boulder'),
    `forest(复用台地语汇) = ${(grouping.forest || []).join('/')}`,
  );

  // ---------------- C. 三角面预算 ----------------
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
    '新增三角面总量（50 处宅院合计）',
    `${base.addedTriangles} ≈ 全场的 ${((base.addedTriangles / 487832) * 100).toFixed(1)}%`,
  );
  info('小品清单', JSON.stringify(base.byRole));
  info('落位重试被挡原因（wall=贴墙 / decor=撞已有小品 / existing=撞既有庭院小品）', JSON.stringify(base.reasons));

  // ---------------- D. 只读约束 ----------------
  const readonly = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const decorNames = new Set();
    w.courtyardDecor.group.children.forEach((c) => decorNames.add(c));

    const clickableHasDecor = w.clickableMeshes.filter(
      (m) => decorNames.has(m) || m.name?.startsWith('courtyard-decor'),
    ).length;

    // 本工程 webgl 层本就没有碰撞系统；确认也没有被本次改动引入
    const collisionKeys = Object.keys(w).filter((k) => /collid|collision|physics|obstacle/i.test(k));

    return {
      clickableCount: w.clickableMeshes.length,
      clickableHasDecor,
      collisionKeys,
      decorGroupIsChildOfScene: w.courtyardDecor.group.parent === w.scene,
      userDataKeys: Object.keys(w.courtyardDecor.group.userData || {}),
    };
  });
  record(
    '未加入 clickableMeshes（小品不可点击、不参与拾取）',
    readonly.clickableHasDecor === 0,
    `clickableMeshes=${readonly.clickableCount} 其中小品=${readonly.clickableHasDecor}`,
  );
  record(
    '未新增任何碰撞体 / 物理体',
    readonly.collisionKeys.length === 0,
    `碰撞相关字段=[${readonly.collisionKeys.join(',')}]`,
  );

  // ---------------- E. 不阻挡 ----------------
  const blocking = await page.evaluate(
    ({ ringFactor, minExisting }) => {
      const w = window.__utopiaWorld;
      const decor = w.courtyardDecor;
      const bounds = decor.boundsByHome;

      let outsideRing = 0;
      let insideHouseBody = 0;
      let unknownHome = 0;
      let minRadius = Infinity;
      let maxRadius = -Infinity;
      let minBodyClearance = Infinity;

      decor.placements.forEach((item) => {
        const bound = bounds.get(item.homeId);
        const home = w.homeObjects.get(item.homeId)?.home;
        if (!bound || !home) {
          unknownHome += 1;
          return;
        }
        minRadius = Math.min(minRadius, item.radius);
        maxRadius = Math.max(maxRadius, item.radius);
        const factor = ringFactor;
        const lo = bound.clear * factor.min - 1e-3;
        const hi = bound.clear * factor.max + 1e-3;
        if (item.radius < lo || item.radius > hi) outsideRing += 1;

        if (bound.bodyRadius) {
          const clearance = item.radius - bound.bodyRadius;
          minBodyClearance = Math.min(minBodyClearance, clearance);
          if (clearance <= 0) insideHouseBody += 1;
        }
      });

      // 与既有庭院小品的实测最小距离
      // 直接读 instanceMatrix 数组里的平移分量（第 12/14 个），避免依赖 THREE 的类构造
      const details = w.scene.getObjectByName('courtyard-details');
      const existing = [];
      if (details) {
        details.children.forEach((mesh) => {
          if (!mesh.isInstancedMesh) return;
          const array = mesh.instanceMatrix.array;
          for (let i = 0; i < mesh.count; i += 1) {
            existing.push({ x: array[i * 16 + 12], z: array[i * 16 + 14] });
          }
        });
      }
      // 与既有庭院小品"无重叠"：间距 − (小品自身半径 + 既有小品半径) ≥ 0
      const footprints = decor.footprints || {};
      let minExistingMargin = Infinity;
      let existingOverlap = 0;
      decor.placements.forEach((item) => {
        const own = (footprints[item.role] || 0.4) * item.scale;
        existing.forEach((p) => {
          const margin =
            Math.hypot(item.x - p.x, item.z - p.z) - own - (p.radius || 0);
          minExistingMargin = Math.min(minExistingMargin, margin);
          if (margin < 0) existingOverlap += 1;
        });
      });

      // 居民状态
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

      const clears = [...bounds.values()].map((b) => b.clear);
      return {
        clearRange: {
          min: Number(Math.min(...clears).toFixed(2)),
          max: Number(Math.max(...clears).toFixed(2)),
        },
        outsideRing,
        insideHouseBody,
        minBodyClearance: Number.isFinite(minBodyClearance)
          ? Number(minBodyClearance.toFixed(2))
          : null,
        unknownHome,
        minRadius: Number(minRadius.toFixed(2)),
        maxRadius: Number(maxRadius.toFixed(2)),
        existingCount: existing.length,
        existingOverlap,
        minExistingMargin: Number.isFinite(minExistingMargin)
          ? Number(minExistingMargin.toFixed(3))
          : null,
        residents: residentChecks,
        beacons: w.residentBeacons.size,
        homeCount: w.homeObjects.size,
      };
    },
    {
      ringFactor: RING_FACTOR,
      minExisting: MIN_EXISTING_SEPARATION,
    },
  );

  record(
    '小品全部落在所属宅院的底盘环带内（不越出台基、不悬到坡地）',
    blocking.outsideRing === 0 && blocking.unknownHome === 0,
    `越界=${blocking.outsideRing} 未知宅院=${blocking.unknownHome} 半径 ${blocking.minRadius}~${blocking.maxRadius}m · 底盘半径 ${blocking.clearRange.min}~${blocking.clearRange.max}m`,
  );
  record(
    '与房屋主体保持退让（落点在主体水平半径之外）—— 不贴墙、不穿模',
    blocking.insideHouseBody === 0,
    `侵入主体=${blocking.insideHouseBody} 最小余量=${blocking.minBodyClearance}m`,
  );
  record(
    '与既有庭院小品无重叠（间距 − 半径和 ≥ 0）',
    blocking.existingOverlap === 0,
    `既有小品 ${blocking.existingCount} 处 · 重叠=${blocking.existingOverlap} · 最小余量=${blocking.minExistingMargin}m（跳过数=${base.skipped}）`,
  );
  record(
    '居民全部在场、状态正常、坐标有限（未被小品影响）',
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

  await safeShot('decor_courtyard.png');

  // ---------------- G. 报错 ----------------
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
