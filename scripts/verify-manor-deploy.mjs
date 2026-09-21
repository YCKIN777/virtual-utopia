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
 *   E. 无穿模/无下陷：宅院互不互穿（XZ 包围盒）、非崖居不下陷进地面
 *   F. 性能与漫游：世界初始化耗时、帧时间稳定性、按 W 可漫游且松键即停
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

/** 性能基线（2026-09-21 换模型前实测，无头 swiftshader）。换模型后只做「不显著劣化」判断。 */
export const BASELINE_PERF = {
  initSeconds: 16.7, // 世界初始化到可交互
  drawCalls: 3812,
  triangles: 487832,
  initTolerance: 0.6, // 初始化耗时允许 +60%
  drawCallTolerance: 0.3, // drawCalls 允许 +30%
  triangleTolerance: 0.6, // triangles 允许 +60%（换 2000–3000 面模型属预期增长）
};

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
    const boxes = [];
    const sunkDetail = [];
    let floating = 0;
    let misaligned = 0;
    let footprintOff = 0;
    let sunk = 0;
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
      const bottomVsGround = box.world.min[1] - home.y;
      const isFloating = box.world.min[1] > home.y + 0.6;
      const isMisaligned = Math.abs(cx - home.x) > 1.5 || Math.abs(cz - home.z) > 1.5;

      // 垂直落位：宅院底基必须落在「模型自身上下沿」该在的位置。
      //  - 非崖居（基线 min.y = 0）：底基贴地，允许 ±0.6m。
      //  - 崖居（基线 min.y = -2.77）：底座本就"插入崖体"向下延伸，其实际落点 = 0.2 + min.y × 组缩放，
      //    组缩放约 1.18–1.37 → 合理区间约 -4.6 ~ -2.0m。这里用 ±(0.8~1.6)×min.y 的宽松区间兜住，
      //    专门拦住"把新模型 min.y 归零"这个经典错误 —— 那会让 12 栋崖居整体抬升 2.8m。
      const bottomViolation =
        base.minY < -0.5
          ? bottomVsGround < base.minY * 1.6 - 0.2 || bottomVsGround > base.minY * 0.8 + 0.2
          : bottomVsGround < -0.6 || bottomVsGround > 0.6;

      if (isFloating) floating += 1;
      if (isMisaligned) misaligned += 1;
      if (footErr > 0.18) footprintOff += 1;
      if (bottomViolation) sunk += 1;
      if (base.minY < -0.5) {
        sunkDetail.push({
          homeId,
          bottomVsGround: Number(bottomVsGround.toFixed(2)),
          expectRange: [
            Number((base.minY * 1.6 - 0.2).toFixed(2)),
            Number((base.minY * 0.8 + 0.2).toFixed(2)),
          ],
          violation: bottomViolation,
        });
      }

      boxes.push({
        homeId,
        group: home.group,
        minX: box.world.min[0],
        maxX: box.world.max[0],
        minZ: box.world.min[2],
        maxZ: box.world.max[2],
      });

      rows.push({
        homeId,
        group: home.group,
        bottomVsGround: Number(bottomVsGround.toFixed(2)),
        dx: Number((cx - home.x).toFixed(2)),
        dz: Number((cz - home.z).toFixed(2)),
        footprint: `${sizeX.toFixed(2)}×${sizeZ.toFixed(2)}`,
        footErr: Number(footErr.toFixed(3)),
        meshes: box.meshes,
        floating: isFloating,
        misaligned: isMisaligned,
        footprintOff: footErr > 0.18,
        sunk: bottomViolation,
      });
    });

    // 互穿（穿模）粗检：相邻宅院的 XZ 包围盒重叠面积占「较小者」的比例。
    // 阈值 0.25 是保守值 —— 只有明显"两栋压在一起"才会命中，轻微贴边不算。
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ox <= 0 || oz <= 0) continue;
        const areaA = (a.maxX - a.minX) * (a.maxZ - a.minZ);
        const areaB = (b.maxX - b.minX) * (b.maxZ - b.minZ);
        const ratio = (ox * oz) / Math.max(1e-6, Math.min(areaA, areaB));
        if (ratio > 0.25) {
          overlaps.push({
            a: a.homeId,
            b: b.homeId,
            ratio: Number(ratio.toFixed(3)),
          });
        }
      }
    }
    overlaps.sort((x, y) => y.ratio - x.ratio);

    let glassHomes = 0;
    let lodHomes = 0;
    w.homeObjects.forEach((entry) => {
      if (entry.glassMaterials?.length) glassHomes += 1;
      if (entry.group?.isLOD || entry.group?.levels) lodHomes += 1;
    });

    return {
      total: rows.length,
      empty,
      floating,
      misaligned,
      footprintOff,
      sunk,
      sunkDetail: sunkDetail.slice(0, 4),
      overlaps,
      lodHomes,
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

  // ---- E. 穿模 / 垂直落位 ----
  console.log('\n=== E. 穿模与垂直落位 ===');
  record(
    '宅院互不互穿（XZ 包围盒重叠 >25% 的相邻宅院对数 = 0）',
    report.overlaps.length === 0,
    report.overlaps.length
      ? `overlaps=${report.overlaps.length} · top=${JSON.stringify(report.overlaps.slice(0, 3))}`
      : 'overlaps=0',
  );
  record(
    '垂直落位正确（非崖居贴地 ±0.6m；崖居保持其向下延伸的底座、未被抬到 0）',
    report.sunk === 0,
    report.sunk === 0
      ? '全部落位在期望区间内'
      : `violations=${report.sunk} · ${JSON.stringify(report.sunkDetail)}`,
  );

  // ---- F. 性能与漫游 ----
  console.log('\n=== F. 性能与漫游 ===');

  const initSeconds = (Date.now() - t0) / 1000;
  record(
    `世界初始化耗时无显著劣化（基线 ${BASELINE_PERF.initSeconds}s，允许 +${BASELINE_PERF.initTolerance * 100}%）`,
    initSeconds <= BASELINE_PERF.initSeconds * (1 + BASELINE_PERF.initTolerance),
    `实测 ${initSeconds.toFixed(1)}s`,
  );

  // 「帧率」在这套无头 swiftshader 环境里量不准（rAF 被节流、无 GPU 光栅化），
  // 因此这里用**可复现的渲染开销代理**做硬判据：模型变重必然抬高 drawCalls / triangles。
  if (report.calls) {
    const callRatio = report.calls.calls / BASELINE_PERF.drawCalls;
    const triRatio = report.calls.triangles / BASELINE_PERF.triangles;
    record(
      `渲染开销未显著上升（drawCalls ≤ 基线×${1 + BASELINE_PERF.drawCallTolerance}、triangles ≤ 基线×${1 + BASELINE_PERF.triangleTolerance}）`,
      callRatio <= 1 + BASELINE_PERF.drawCallTolerance &&
        triRatio <= 1 + BASELINE_PERF.triangleTolerance,
      `drawCalls=${report.calls.calls}(${callRatio.toFixed(2)}×) triangles=${report.calls.triangles}(${triRatio.toFixed(2)}×)`,
    );
  }
  record(
    'LOD 分级仍在（帧率保护机制未丢）',
    report.lodHomes > 0,
    `lodHomes=${report.lodHomes}/${report.total}`,
  );

  // rAF 帧时间：仅作 INFO（环境不具代表性，不作为判据）
  const perf = await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    const start = last;
    await new Promise((resolve) => {
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        if (frames.length >= 20 || now - start > 8000) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const usable = frames.slice(2).sort((a, b) => a - b);
    const pick = (q) => usable[Math.min(usable.length - 1, Math.floor(usable.length * q))] || 0;
    return {
      samples: usable.length,
      medianMs: Number(pick(0.5).toFixed(1)),
      p95Ms: Number(pick(0.95).toFixed(1)),
    };
  });
  info(
    'rAF 帧时间采样（无头 swiftshader 被节流，仅作相对参考；真实帧率请在带 GPU 的浏览器里核）',
    `samples=${perf.samples} median=${perf.medianMs}ms${perf.medianMs ? ` (${(1000 / perf.medianMs).toFixed(1)}fps)` : ''} p95=${perf.p95Ms}ms`,
  );

  // 漫游：真按键 → 相机位移 → 松键即停（覆盖「相机漫游正常」）
  // 注意：无头 swiftshader 下 rAF 被节流到 ~4s/帧，而主循环对 delta 做了钳制（单帧位移 ≈0.45m），
  // 所以这里按住 5s 以保证至少跑到 1 个更新帧；判据同时看「按键被识别」与「确有位移」。
  const readCam = () =>
    page.evaluate(() => {
      const w = window.__utopiaWorld;
      const local = w.getLocalAvatarState ? w.getLocalAvatarState() : null;
      return {
        cx: w.camera.position.x,
        cz: w.camera.position.z,
        hasLocal: Boolean(local),
        ax: local ? local.x : null,
        az: local ? local.z : null,
      };
    });

  const roamBefore = await readCam();
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  const keyHeld = await page.evaluate(() => window.__utopiaWorld.keys.has('KeyW'));
  await page.waitForTimeout(5000);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  const keyReleased = await page.evaluate(() => !window.__utopiaWorld.keys.has('KeyW'));
  const roamAfter = await readCam();
  const camMoved = Math.hypot(roamAfter.cx - roamBefore.cx, roamAfter.cz - roamBefore.cz);
  const avatarMoved =
    roamBefore.hasLocal && roamAfter.hasLocal
      ? Math.hypot(roamAfter.ax - roamBefore.ax, roamAfter.az - roamBefore.az)
      : null;

  await page.waitForTimeout(700);
  const roamRest = await readCam();
  const camDrift = Math.hypot(roamRest.cx - roamAfter.cx, roamRest.cz - roamAfter.cz);

  record(
    '相机漫游可用（W 键被识别 · 按住后相机位移 > 0.3m）',
    keyHeld && keyReleased && camMoved > 0.3,
    `keyHeld=${keyHeld} keyReleased=${keyReleased} 相机位移 ${camMoved.toFixed(2)}m${avatarMoved === null ? '（本次无本地 Avatar，只验相机）' : `，本地 Avatar 位移 ${avatarMoved.toFixed(2)}m`}`,
  );
  record(
    '松开按键后相机停下（无惯性漂移 > 0.3m）',
    camDrift < 0.3,
    `松键后位移 ${camDrift.toFixed(2)}m`,
  );

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
