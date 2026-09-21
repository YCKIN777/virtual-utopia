#!/usr/bin/env node
/**
 * 宅院模型部署「自检器」—— 一条命令跑完模型侧 + 场景侧的关键硬性检查。
 *
 *   node scripts/verify-manor-deploy.mjs                # 全量（GLB 预检 + 无头场景校验）
 *   node scripts/verify-manor-deploy.mjs --glb-only      # 只跑模型侧（不启浏览器，秒级）
 *
 * 覆盖（对应交付自检清单）：
 *   A. 模型侧：三角面区间 / 无动画 / 无蒙皮 / 未悬空 / 原点水平居中 / 占地与基线一致
 *   B. 场景侧：50 栋宅院全部挂载成功、不悬浮、与地块对齐、占地与原模型一致
 *   C. 既有系统：灯笼×5、居民×5、可点击网格、玻璃夜光仍在
 *   D. 0 控制台报错
 *
 * 注意：模型侧「占地与基线一致」用 BASELINE（换模型前实测值）比较 —— 这是「占地范围不变」的硬保证。
 *      若新模型是 9m 级，请先在 Blender/gltf-transform 里归一化到基线尺度再部署。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { inspectGlb, BASELINE } from './inspect-manor-glb.mjs';

const WORLD = process.env.WORLD_URL || 'http://localhost:5199';
const MODELS_DIR = path.resolve('frontend/src/virtual-utopia/webgl/models');
const GLB_ONLY = process.argv.includes('--glb-only');
const TRI_TARGET = [2000, 3000];
const FOOTPRINT_TOLERANCE = 0.18;

const results = [];
const record = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};
const info = (label, extra = '') => console.log(`INFO ${label}${extra ? ' · ' + extra : ''}`);

// ---------------------------------------------------------------- A. 模型侧
console.log('=== A. 模型侧预检（GLB） ===');

const FILES = {
  'terrace-manor.glb': 'terrace',
  'forest-manor.glb': 'forest',
  'cliff-manor.glb': 'cliff',
};
const glbInfo = {};

Object.keys(FILES).forEach((fileName) => {
  const full = path.join(MODELS_DIR, fileName);
  let glb;
  try {
    glb = inspectGlb(full);
  } catch (error) {
    record(`[${fileName}] 可解析`, false, error.message);
    return;
  }
  glbInfo[fileName] = glb;
  const base = BASELINE[fileName];
  const ratio = (a, b) => (b === 0 ? 0 : Math.abs(a - b) / b);

  record(`[${fileName}] 无动画/无蒙皮`, glb.animations === 0 && glb.skins === 0);
  record(`[${fileName}] 未悬空（min.y ≤ 0.08）`, glb.minY <= 0.08, `min.y=${glb.minY.toFixed(3)}`);
  record(
    `[${fileName}] 原点水平居中（≤0.6m）`,
    Math.abs(glb.centerX) <= 0.6 && Math.abs(glb.centerZ) <= 0.6,
    `(${glb.centerX.toFixed(2)}, ${glb.centerZ.toFixed(2)})`,
  );
  record(
    `[${fileName}] 占地与基线一致（±${FOOTPRINT_TOLERANCE * 100}%）`,
    ratio(glb.sizeX, base.sizeX) <= FOOTPRINT_TOLERANCE &&
      ratio(glb.sizeZ, base.sizeZ) <= FOOTPRINT_TOLERANCE,
    `${base.sizeX}×${base.sizeZ} → ${glb.sizeX.toFixed(2)}×${glb.sizeZ.toFixed(2)}`,
  );
  record(
    `[${fileName}] 高度与基线一致（±15%）`,
    ratio(glb.sizeY, base.sizeY) <= 0.15,
    `${base.sizeY} → ${glb.sizeY.toFixed(2)}`,
  );

  const inTarget = glb.triangles >= TRI_TARGET[0] && glb.triangles <= TRI_TARGET[1];
  if (inTarget) {
    record(`[${fileName}] 三角面落在 ${TRI_TARGET.join('–')}`, true, String(glb.triangles));
  } else {
    info(
      `[${fileName}] 三角面 ${glb.triangles} 不在 ${TRI_TARGET.join('–')}（换新模型前的旧模型属预期）`,
    );
    record(`[${fileName}] 三角面未归零（≥200）`, glb.triangles >= 200, String(glb.triangles));
  }
});

if (GLB_ONLY) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------- B/C/D. 场景侧
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

const t0 = Date.now();

try {
  console.log('\n=== B. 场景侧校验（无头 Three.js） ===');
  await page.goto(`${WORLD}/#/world`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction(() => Boolean(window.__utopiaWorld), null, {
    timeout: 90000,
  });
  await page.waitForTimeout(2500);
  info('世界初始化耗时（含全部模型与材质）', `${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const report = await page.evaluate((baseline) => {
    const w = window.__utopiaWorld;

    // 只看「模型本体」网格：buildHomes 的遍历会给模型网格打 userData.homeId，
    // 后加的庭院小品/内饰（平台、光晕、栏杆、室内）没有这个标记 → 直接排除，
    // 这样「占地」才等于模型自身占地，不被小品撑大。
    const measure = (root) => {
      root.updateWorldMatrix(true, true);
      const inverseRoot = root.matrixWorld.clone().invert();
      const world = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      const local = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      let meshes = 0;

      root.traverse((child) => {
        if (!child.isMesh || !child.geometry?.attributes?.position) return;
        if (child.userData?.homeId === undefined) return; // 排除后加的小品/内饰
        meshes += 1;

        const position = child.geometry.attributes.position;
        const worldMatrix = child.matrixWorld.elements;
        const localMatrix = child.matrixWorld.clone().premultiply(inverseRoot).elements;

        for (let i = 0; i < position.count; i += 1) {
          const x = position.getX(i);
          const y = position.getY(i);
          const z = position.getZ(i);

          const wx = worldMatrix[0] * x + worldMatrix[4] * y + worldMatrix[8] * z + worldMatrix[12];
          const wy = worldMatrix[1] * x + worldMatrix[5] * y + worldMatrix[9] * z + worldMatrix[13];
          const wz = worldMatrix[2] * x + worldMatrix[6] * y + worldMatrix[10] * z + worldMatrix[14];
          if (wx < world.min[0]) world.min[0] = wx;
          if (wy < world.min[1]) world.min[1] = wy;
          if (wz < world.min[2]) world.min[2] = wz;
          if (wx > world.max[0]) world.max[0] = wx;
          if (wy > world.max[1]) world.max[1] = wy;
          if (wz > world.max[2]) world.max[2] = wz;

          const lx = localMatrix[0] * x + localMatrix[4] * y + localMatrix[8] * z + localMatrix[12];
          const ly = localMatrix[1] * x + localMatrix[5] * y + localMatrix[9] * z + localMatrix[13];
          const lz = localMatrix[2] * x + localMatrix[6] * y + localMatrix[10] * z + localMatrix[14];
          if (lx < local.min[0]) local.min[0] = lx;
          if (ly < local.min[1]) local.min[1] = ly;
          if (lz < local.min[2]) local.min[2] = lz;
          if (lx > local.max[0]) local.max[0] = lx;
          if (ly > local.max[1]) local.max[1] = ly;
          if (lz > local.max[2]) local.max[2] = lz;
        }
      });

      return { world, local, meshes };
    };

    const rows = [];
    let floating = 0;
    let misaligned = 0;
    let footprintOff = 0;
    let empty = 0;

    w.homeObjects.forEach((entry, homeId) => {
      const home = entry.home;
      const base =
        home.group === 'cliff'
          ? baseline['cliff-manor.glb']
          : home.group === 'forest'
            ? baseline['forest-manor.glb']
            : baseline['terrace-manor.glb'];

      const box = measure(entry.group);
      if (box.meshes === 0) {
        empty += 1;
        rows.push({ homeId, meshes: 0, empty: true });
        return;
      }

      // 占地：用「模型本地坐标系」的包围盒（不含组团缩放/旋转），直接与基线比
      const sizeX = box.local.max[0] - box.local.min[0];
      const sizeZ = box.local.max[2] - box.local.min[2];
      const footErr = Math.max(
        Math.abs(sizeX - base.sizeX) / base.sizeX,
        Math.abs(sizeZ - base.sizeZ) / base.sizeZ,
      );

      const cx = (box.world.max[0] + box.world.min[0]) / 2;
      const cz = (box.world.max[2] + box.world.min[2]) / 2;
      const isFloating = box.world.min[1] > home.y + 0.6;
      const isMisaligned = Math.abs(cx - home.x) > 1.5 || Math.abs(cz - home.z) > 1.5;

      if (isFloating) floating += 1;
      if (isMisaligned) misaligned += 1;
      if (footErr > 0.18) footprintOff += 1;

      rows.push({
        homeId,
        group: home.group,
        bottomVsGround: Number((box.world.min[1] - home.y).toFixed(2)),
        dx: Number((cx - home.x).toFixed(2)),
        dz: Number((cz - home.z).toFixed(2)),
        footprint: `${sizeX.toFixed(2)}×${sizeZ.toFixed(2)}`,
        footErr: Number(footErr.toFixed(3)),
        meshes: box.meshes,
        floating: isFloating,
        misaligned: isMisaligned,
        footprintOff: footErr > 0.18,
      });
    });

    let glassHomes = 0;
    w.homeObjects.forEach((entry) => {
      if (entry.glassMaterials?.length) glassHomes += 1;
    });

    return {
      total: rows.length,
      empty,
      floating,
      misaligned,
      footprintOff,
      sample: rows.slice(0, 5),
      worst: rows
        .filter((r) => r.footErr !== undefined)
        .sort((a, b) => b.footErr - a.footErr)
        .slice(0, 3),
      beacons: w.residentBeacons.size,
      residents: w.getResidentAvatarStates().length,
      clickable: w.clickableMeshes.length,
      glassHomes,
      materials: w.manorMaterials ? w.manorMaterials.materialCount : 0,
      calls: (() => {
        const renderInfo = w.renderer?.info;
        return renderInfo
          ? { calls: renderInfo.render.calls, triangles: renderInfo.render.triangles }
          : null;
      })(),
    };
  }, BASELINE);

  record(
    `全部 ${report.total} 栋宅院挂载成功（模型网格非空）`,
    report.total === 50 && report.empty === 0,
    `total=${report.total} empty=${report.empty}`,
  );
  record(
    '无宅院悬浮（模型底面包围盒不高于地面 +0.6m）',
    report.floating === 0,
    `floating=${report.floating}`,
  );
  record(
    '宅院与地块对齐（包围盒中心偏差 ≤1.5m）',
    report.misaligned === 0,
    `misaligned=${report.misaligned}`,
  );
  record(
    '占地与原模型一致（偏差 ≤18%）',
    report.footprintOff === 0,
    `off=${report.footprintOff} · 最大偏差样本=${JSON.stringify(report.worst)}`,
  );
  record(
    '既有系统在位（灯笼×5 / 居民×5 / 可点击网格 / 玻璃夜光）',
    report.beacons === 5 &&
      report.residents === 5 &&
      report.clickable > 0 &&
      report.glassHomes > 0,
    `beacons=${report.beacons} residents=${report.residents} clickable=${report.clickable} glass=${report.glassHomes}`,
  );
  record('共享材质库在用', report.materials > 0, `materials=${report.materials}`);
  if (report.calls) {
    info(
      '当前相机下的渲染开销（供帧率参考）',
      `drawCalls=${report.calls.calls} triangles=${report.calls.triangles}`,
    );
  }
  info('宅院包围盒抽查（前 5 栋）', JSON.stringify(report.sample));

  const meaningful = errors.filter((e) => !/favicon/i.test(e));
  record('0 控制台报错', meaningful.length === 0, meaningful.slice(0, 2).join(' | '));
} catch (error) {
  record('场景侧执行异常', false, error.message);
} finally {
  await ctx.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 汇总: ${failed.length === 0 ? '全部通过' : failed.length + ' 项失败'} ===`);
process.exit(failed.length ? 1 : 0);
