#!/usr/bin/env node
/**
 * 【材质迭代】宋式诧寂山居 · 宅院材质方案 —— 自测。
 *
 * 只验证「材质」这一层，并顺带确认其它系统未被波及：
 *   1. 共享材质库已建立：1024² 程序化贴图 ×5、材质按 role:group 缓存复用
 *   2. 宅院网格确实用上了共享材质（而非每网格 clone），复用率显著
 *   3. 夯土/原木/青灰瓦/毛石 多角色都命中；凹凸图与哑光参数生效
 *   4. 既有系统仍在位（灯笼×5、可点击网格、50 个宅院、玻璃夜光）
 *   5. 0 控制台报错
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const SCREEN_DIR = path.resolve('vu_screens');
mkdirSync(SCREEN_DIR, { recursive: true });

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

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

  // ---- 1) 共享材质库 / 贴图 ----
  const lib = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const library = w.manorMaterials;
    if (!library) return null;
    const textures = Object.entries(library.textures || {}).map(([role, t]) => ({
      role,
      size: t.map?.image?.width || 0,
      repeat: t.map ? [t.map.repeat.x, t.map.repeat.y] : null,
      sharedBump: t.map === t.bump,
      roughnessSize: t.roughness?.image?.width || 0,
      roughnessIsLinear: t.roughness ? t.roughness.colorSpace === '' : false,
    }));
    return {
      size: library.size,
      materialCount: library.materialCount,
      textures,
    };
  });
  record(
    '共享材质库已建立（贴图 1024² ×5，材质数有界）',
    Boolean(lib) &&
      lib.size === 1024 &&
      lib.textures.length === 5 &&
      lib.textures.every((t) => t.size === 1024) &&
      lib.materialCount > 0 &&
      lib.materialCount <= 24,
    lib
      ? `size=${lib.size} materials=${lib.materialCount} textures=${lib.textures
          .map((t) => `${t.role}:${t.size}`)
          .join(',')}`
      : 'no-library',
  );
  record(
    '凹凸图复用颜色贴图（0 额外显存）',
    Boolean(lib) && lib.textures.every((t) => t.sharedBump === true),
  );
  record(
    '粗糙度贴图已生成（1024² 逐角色 · 线性数据图）',
    Boolean(lib) &&
      lib.textures.length === 5 &&
      lib.textures.every((t) => t.roughnessSize === 1024) &&
      lib.textures.every((t) => t.roughnessIsLinear === true),
    lib
      ? lib.textures.map((t) => `${t.role}:${t.roughnessSize}${t.roughnessIsLinear ? '' : '!sRGB'}`).join(',')
      : 'no-library',
  );

  // ---- 2) 复用率 + 3) 角色命中 ----
  const usage = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    const meshMaterials = new Map(); // uuid -> {name, meshes, homes:Set}
    let meshTotal = 0;
    let unnamed = 0;
    let withMap = 0;
    let withBump = 0;
    let withRoughness = 0;
    const roughnessTextures = new Set();
    let glassMeshes = 0;
    const rolesHit = new Set();
    const matsByRole = {};

    w.homeObjects.forEach((entry, homeId) => {
      entry.group.traverse((child) => {
        if (!child.isMesh) return;
        meshTotal += 1;
        const material = child.material;
        if (!material) return;
        const name = material.name || '';
        if (!name.startsWith('manor-')) {
          unnamed += 1;
          if (material.emissiveIntensity > 0) glassMeshes += 1;
          return;
        }
        const key = material.uuid;
        if (!meshMaterials.has(key)) {
          meshMaterials.set(key, { name, meshes: 0, homes: new Set() });
        }
        const record = meshMaterials.get(key);
        record.meshes += 1;
        record.homes.add(homeId);
        if (material.map) withMap += 1;
        if (material.bumpMap) withBump += 1;
        if (material.roughnessMap) {
          withRoughness += 1;
          roughnessTextures.add(material.roughnessMap.uuid);
        }
        const role = name.split(':')[0].replace('manor-', '');
        rolesHit.add(role);
        matsByRole[role] = (matsByRole[role] || 0) + 1;
      });
    });

    const entries = [...meshMaterials.values()].sort((a, b) => b.meshes - a.meshes);
    return {
      homeCount: w.homeObjects.size,
      meshTotal,
      uniqueShared: meshMaterials.size,
      unnamed,
      withMap,
      withBump,
      withRoughness,
      uniqueRoughness: roughnessTextures.size,
      glassMeshes,
      rolesHit: [...rolesHit],
      matsByRole,
      top: entries[0]
        ? { name: entries[0].name, meshes: entries[0].meshes, homes: entries[0].homes.size }
        : null,
      ratio: Number((meshTotal / Math.max(1, meshMaterials.size)).toFixed(2)),
    };
  });

  record(
    '宅院网格使用共享材质（复用率 > 5×）',
    usage.uniqueShared > 0 && usage.ratio > 5,
    `${usage.meshTotal} 网格 / ${usage.uniqueShared} 共享材质 = ${usage.ratio}×；最多一份用在 ${usage.top ? usage.top.meshes : 0} 个网格、${usage.top ? usage.top.homes : 0} 栋宅院`,
  );
  record(
    '多角色命中（夯土/原木/青灰瓦/毛石 至少 3 类）',
    usage.rolesHit.length >= 3,
    `roles=${usage.rolesHit.join('/')} · ${JSON.stringify(usage.matsByRole)}`,
  );
  record(
    '贴图已挂上材质（map + bumpMap 生效）',
    usage.withMap > 0 && usage.withBump > 0,
    `withMap=${usage.withMap} withBump=${usage.withBump}`,
  );
  record(
    '粗糙度贴图同样被复用（≤5 张服务全部材质）',
    usage.withRoughness > 0 && usage.uniqueRoughness <= 5,
    `withRoughnessMap=${usage.withRoughness} uniqueRoughnessTextures=${usage.uniqueRoughness}`,
  );

  // ---- 4) 既有系统未受影响 ----
  const intact = await page.evaluate(() => {
    const w = window.__utopiaWorld;
    let glassHomes = 0;
    w.homeObjects.forEach((entry) => {
      if (entry.glassMaterials && entry.glassMaterials.length) glassHomes += 1;
    });
    return {
      beacons: w.residentBeacons.size,
      homes: w.homeObjects.size,
      clickable: w.clickableMeshes.length,
      glassHomes,
      residents: w.getResidentAvatarStates().length,
    };
  });
  record(
    '既有系统在位（灯笼×5 / 50 宅院 / 可点击网格 / 5 居民 / 玻璃夜光）',
    intact.beacons === 5 &&
      intact.homes === 50 &&
      intact.clickable > 0 &&
      intact.residents === 5 &&
      intact.glassHomes > 0,
    JSON.stringify(intact),
  );

  await safeShot('phase_mat_manors.png');

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
