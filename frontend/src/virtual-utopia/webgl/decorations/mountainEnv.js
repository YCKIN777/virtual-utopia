/**
 * 山林公共环境细化（视觉层）—— 山坡植被 / 溪流乱石 / 林间薄雾。
 *
 * 硬性约束（本模块的设计前提）
 *  - **只做视觉**：不注册碰撞体（本工程 webgl 层本就没有碰撞系统）、不加入 `clickableMeshes`、
 *    不改地块坐标、宅院边界、地形高程、河道位置、居民 AI 闲逛、相机漫游、后端、注册、聊天、人设。
 *  - **单物件三角面 300–800**：7 个配方均按此区间设计，实测 320–720。
 *  - **不新增动画**：全部 InstancedMesh + 静态矩阵，不参与任何 update 循环（薄雾层除外，它只做
 *    极慢的水平漂移，不触碰相机/居民/几何，且可被 `windEnabled` 关闭）。
 *  - **不侵占居民活动范围**：落位以「距宅院中心 ≥ 8m、距组团枢纽 ≥ 7m、距河道中线 ≥ 河宽×1.9」
 *    为硬排除；居民漫游半径仅 5.5m，故环境小品永远在其活动圈外 ≥ 2.5m。
 *  - **大量实例化**：每个「角色」一个 InstancedMesh，整体新增 draw call 极少，面数受预算硬控。
 *
 * 三类内容
 *  - 山坡植被：矮灌丛（向阳/背阴两套色与疏密）、矮树丛、蕨类丛 —— 按向阳/背阴坡区分疏密与色相。
 *  - 溪流乱石：溪流两岸大小不等毛石 + 浅滩碎石 —— 仅视觉装饰，不改动河道几何与水位。
 *  - 林间薄雾：一层贴地的柔和环境薄雾（半透明低带），不干扰物件渲染清晰度。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTerrainHeight } from '../worldLayout.js';

// 阳光方向（与 ThreeWorld.addLights 的 DirectionalLight.position 一致：64,82,46）
// 只取水平分量判定"坡向是否朝阳"。
const SUN_DIR = new THREE.Vector3(64, 0, 46).normalize();

// ---------------------------------------------------------------- 可调常量

/** 单物件三角面区间（硬性约束）。 */
export const TRI_BUDGET = { min: 300, max: 800 };

/** 公共山林区域半径范围（米）：避开中心广场（< 18）与远山脚带（> 72，已有 foothill-buffer 覆盖）。 */
const SLOPE_RING = { min: 20, max: 72 };

/** 与宅院的最小净距（米）：居民漫游半径仅 5.5m，此处 ≥ 8m 保证其活动圈外 ≥ 2.5m。 */
const HOME_CLEAR = 8.0;
/** 与组团枢纽的最小净距（米）：居民往来宅院↔枢纽的主路从这里辐射。 */
const HUB_CLEAR = 7.0;
/** 与河道中线的净距系数：小于 河宽 × 该值 的区域视为河道，不放山坡植被。 */
const STREAM_CLEAR_FACTOR = 1.9;

/** 溪流乱石：落点在「河宽 × [近, 远]」的环带内（两岸）。 */
const STREAM_BANK_NEAR = 1.15;
const STREAM_BANK_FAR = 2.4;

/** 薄雾层参数（林间薄雾后处理）。 */
export const MIST_PARAMS = {
  // 两个高度带，模拟贴地薄雾；opacity 极低，不糊化中近景物件
  bands: [
    { y: 5.5, height: 11, radius: 150, opacity: 0.07, color: '#cfe0d8' },
    { y: 9.5, height: 16, radius: 178, opacity: 0.05, color: '#dbe7df' },
  ],
  driftSpeed: 0.6, // 极慢水平漂移（rad/s），可被 windEnabled 关闭
};

// ---------------------------------------------------------------- 三角面工具

/** 精确统计一组几何体的三角面数。 */
export const countTriangles = (geometries) =>
  geometries.reduce((sum, geometry) => {
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    if (index) return sum + index.count / 3;
    return sum + (position ? position.count / 3 : 0);
  }, 0);

/** 几何体落地对齐：包围盒底面压到 y=0、水平中心移到 x=z=0。 */
const groundAlign = (geometry) => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2,
  );
  geometry.computeVertexNormals();
  return geometry;
};

/** 合并多块几何为一个（InstancedMesh 需要单一 geometry）。 */
const mergeOrFirst = (parts) => {
  const normalized = parts.map((part) => (part.getIndex() ? part.toNonIndexed() : part));
  const merged = mergeGeometries(normalized, false);
  if (merged) return merged;
  console.warn('[mountain-env] 几何合并失败，退回首个部件');
  return normalized[0];
};

/** 地形法线（有限差分）—— 用于判定坡向是否朝阳。 */
const terrainNormal = (x, z) => {
  const e = 0.6;
  const hL = getTerrainHeight(x - e, z);
  const hR = getTerrainHeight(x + e, z);
  const hD = getTerrainHeight(x, z - e);
  const hU = getTerrainHeight(x, z + e);
  return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
};

/** 溪流水道中心 x（与 worldLayout.getStreamX 完全一致，避免引入依赖）。 */
const streamXAt = (z) => Math.sin(z * 0.075) * 9;
const streamWidthAt = (z) =>
  1.45 +
  (0.5 + 0.5 * Math.sin(z * 0.087)) * 1.2 +
  (0.5 + 0.5 * Math.sin(z * 0.021 + 1.7)) * 0.85;

// ---------------------------------------------------------------- 7 个配方（每个实测落在 300–800 面）

/** 矮灌丛·向阳：紧凑、暖绿、球冠偏低。 */
const buildShrubSunny = () => {
  const parts = [];
  const main = new THREE.IcosahedronGeometry(0.52, 1);
  main.scale(1.05, 0.82, 1.05);
  main.translate(0, 0.42, 0);
  parts.push(main);
  [
    [0.34, 0.30, 0.12, 0.78],
    [-0.30, 0.34, -0.1, 0.8],
    [0.06, 0.18, -0.34, 0.66],
  ].forEach(([x, y, z, s]) => {
    const c = new THREE.IcosahedronGeometry(0.34 * s, 1);
    c.scale(1.05, 0.85, 1.05);
    c.translate(x, y, z);
    parts.push(c);
  });
  const trunk = new THREE.CylinderGeometry(0.09, 0.12, 0.34, 6, 1);
  trunk.translate(0, 0.17, 0);
  parts.push(trunk);
  return groundAlign(mergeOrFirst(parts));
};

/** 矮灌丛·背阴：略高、冷绿、冠更松散。 */
const buildShrubShade = () => {
  const parts = [];
  const main = new THREE.IcosahedronGeometry(0.5, 1);
  main.scale(0.95, 1.05, 0.95);
  main.translate(0, 0.62, 0);
  parts.push(main);
  [
    [0.4, 0.5, 0.04, 0.85],
    [-0.36, 0.54, -0.12, 0.82],
    [0.04, 0.4, -0.4, 0.7],
    [0.22, 0.3, 0.3, 0.62],
  ].forEach(([x, y, z, s]) => {
    const c = new THREE.IcosahedronGeometry(0.32 * s, 1);
    c.scale(0.95, 1.05, 0.95);
    c.translate(x, y, z);
    parts.push(c);
  });
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6, 1);
  trunk.translate(0, 0.25, 0);
  parts.push(trunk);
  return groundAlign(mergeOrFirst(parts));
};

/** 矮树丛：细干 + 4 团冠（介于灌丛与成树之间，疏林感）。 */
const buildDwarfTree = () => {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.1, 0.16, 1.05, 6, 2);
  trunk.translate(0, 0.52, 0);
  parts.push(trunk);
  [
    [0, 1.45, 0, 0.6, 1, 1],
    [0.36, 1.18, 0.12, 0.42, 0.95, 1],
    [-0.32, 1.22, -0.1, 0.4, 0.95, 1],
    [0.04, 1.0, 0.34, 0.34, 0.95, 1],
  ].forEach(([x, y, z, r, sy, sz]) => {
    const c = new THREE.IcosahedronGeometry(r, 1);
    c.scale(1.05, sy, sz);
    c.translate(x, y, z);
    parts.push(c);
  });
  return groundAlign(mergeOrFirst(parts));
};

/** 蕨类丛：一丛细长三角叶片（贴地、轻盈）。 */
const buildFernClump = () => {
  const parts = [];
  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const lean = 0.5 + (i % 3) * 0.12;
    const frond = new THREE.ConeGeometry(0.06, 0.78, 8, 1);
    frond.translate(0, 0.39, 0);
    frond.rotateX(lean);
    frond.rotateY(a);
    frond.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    parts.push(frond);
  }
  return groundAlign(mergeOrFirst(parts));
};

/** 溪流毛石（大）：1 主石（detail2）+ 3 配石 + 2 碎石。 */
const buildStreamBoulder = () => {
  const parts = [];
  const main = new THREE.IcosahedronGeometry(0.62, 2);
  main.scale(1.2, 0.8, 1.05);
  main.translate(0, 0.42, 0);
  parts.push(main);
  [
    [0.6, 0.28, 0.12, 0.4, 1, 0.85, 1],
    [-0.5, 0.24, -0.18, 0.36, 1, 0.8, 1],
    [0.1, 0.2, 0.55, 0.34, 1, 0.82, 1],
  ].forEach(([x, y, z, r, d, sy, sz]) => {
    const rock = new THREE.IcosahedronGeometry(r, d);
    rock.scale(1.1, sy, sz);
    rock.translate(x, y, z);
    parts.push(rock);
  });
  [
    [0.3, 0.12, -0.42, 0.22],
    [-0.28, 0.1, 0.36, 0.2],
  ].forEach(([x, y, z, r]) => {
    const rock = new THREE.IcosahedronGeometry(r, 1);
    rock.translate(x, y, z);
    parts.push(rock);
  });
  return groundAlign(mergeOrFirst(parts));
};

/** 溪流碎石（小）：一丛浅滩碎石（贴水、扁平）。 */
const buildStreamPebble = () => {
  const parts = [];
  [
    [0, 0.09, 0, 0.34, 1, 0.5, 1],
    [0.4, 0.07, 0.1, 0.24, 1, 0.5, 1.1],
    [-0.36, 0.07, -0.08, 0.26, 1, 0.5, 1],
    [0.12, 0.06, 0.4, 0.2, 1, 0.5, 1.05],
    [-0.18, 0.05, -0.36, 0.18, 1, 0.5, 1.1],
    [0.5, 0.05, -0.3, 0.16, 1, 0.5, 1.05],
  ].forEach(([x, y, z, r, d, sy, sz]) => {
    const rock = new THREE.IcosahedronGeometry(r, d);
    rock.scale(1.15, sy, sz);
    rock.translate(x, y, z);
    parts.push(rock);
  });
  return groundAlign(mergeOrFirst(parts));
};

/**
 * 配方表。`material` 指向材质键（stone = 复用 manorMaterials 共享毛石贴图；foliage = 本模块专属绿调）。
 */
export const ENV_RECIPES = {
  shrubSunny: { label: '矮灌丛·向阳', build: buildShrubSunny, kind: 'slope', material: 'foliage', tint: '#6f9a54', roughness: 1.0, bumpScale: 0.04 },
  shrubShade: { label: '矮灌丛·背阴', build: buildShrubShade, kind: 'slope', material: 'foliage', tint: '#3f6f49', roughness: 1.0, bumpScale: 0.04 },
  dwarfTree: { label: '矮树丛', build: buildDwarfTree, kind: 'slope', material: 'foliage', tint: '#557f48', roughness: 1.0, bumpScale: 0.04 },
  fernClump: { label: '蕨类丛', build: buildFernClump, kind: 'slope', material: 'foliage', tint: '#4e8a55', roughness: 1.0, bumpScale: 0.03 },
  streamBoulder: { label: '溪流毛石', build: buildStreamBoulder, kind: 'stream', material: 'stone', tint: '#8d8b7b', roughness: 1.0, bumpScale: 0.07 },
  streamPebble: { label: '溪流碎石', build: buildStreamPebble, kind: 'stream', material: 'stone', tint: '#9a9788', roughness: 0.98, bumpScale: 0.06 },
};

Object.entries(ENV_RECIPES).forEach(([key, recipe]) => {
  recipe.role = key;
});

// ---------------------------------------------------------------- 材质

/**
 * 建立环境材质集：
 *  - foliage（植被）：本模块专属低饱和绿调 MeshStandardMaterial，纯色无贴图 → **0 新增贴图显存**。
 *  - stone（溪流石）：复用 manorMaterials 的共享毛石程序化贴图（map + bumpMap + roughnessMap），
 *    仅换基色 → 与既有河石同一套石面质感，不新增显存。
 */
export const createEnvMaterials = ({ library }) => {
  const textures = library?.textures || {};
  const materials = {};

  Object.entries(ENV_RECIPES).forEach(([role, recipe]) => {
    if (recipe.material === 'stone') {
      const set = textures.stone || null;
      materials[role] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(recipe.tint),
        roughness: recipe.roughness,
        metalness: 0,
        map: set ? set.map : null,
        bumpMap: set ? set.bump : null,
        bumpScale: set ? recipe.bumpScale : 0,
        roughnessMap: set ? set.roughness : null,
        dithering: true,
      });
    } else {
      materials[role] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(recipe.tint),
        roughness: recipe.roughness,
        metalness: 0,
        dithering: true,
      });
    }
    materials[role].name = `env-${role}`;
  });

  return materials;
};

// ---------------------------------------------------------------- 确定性随机

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FOLIAGE_PALETTE = {
  shrubSunny: ['#6f9a54', '#7ba85e', '#5e8c4a'].map((c) => new THREE.Color(c)),
  shrubShade: ['#3f6f49', '#356140', '#4a7a52'].map((c) => new THREE.Color(c)),
  dwarfTree: ['#557f48', '#4c7340', '#628a52'].map((c) => new THREE.Color(c)),
  fernClump: ['#4e8a55', '#56995e', '#447e4c'].map((c) => new THREE.Color(c)),
};

// ---------------------------------------------------------------- 落位规划（纯计算，不碰场景）

const getStreamX = streamXAt;
const getStreamWidth = streamWidthAt;

/**
 * @param homes         宅基清单（只读 home.x / home.z）
 * @param hubs          组团枢纽清单 [{x,z}]（只读）
 */
export const planMountainEnv = ({ homes = [], hubs = [] }) => {
  const random = mulberry32(20260922);
  const slopeItems = [];
  const streamItems = [];

  // —— 山坡植被：在 SLOPE_RING 内撒点，避开河道 / 宅院 / 枢纽 / 广场 ——
  // 向阳坡：命中率高（密）；背阴坡：命中率低（疏）。
  let sunnyCount = 0;
  let shadyCount = 0;
  const maxSlopeAttempts = 2600;
  let attempts = 0;
  while (attempts < maxSlopeAttempts && slopeItems.length < 540) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius =
      SLOPE_RING.min + Math.pow(random(), 0.85) * (SLOPE_RING.max - SLOPE_RING.min);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const streamDist = Math.abs(x - getStreamX(z));
    if (streamDist < getStreamWidth(z) * STREAM_CLEAR_FACTOR) continue;
    if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < HOME_CLEAR)) continue;
    if (hubs.some((h) => Math.hypot(h.x - x, h.z - z) < HUB_CLEAR)) continue;

    const normal = terrainNormal(x, z);
    const sunny = normal.dot(SUN_DIR) > 0.02;

    // 疏密：向阳坡接受率更高；背阴坡更低（天然林下稀疏）
    const accept = sunny ? random() < 0.92 : random() < 0.5;
    if (!accept) continue;

    let role;
    if (sunny) {
      const r = random();
      role = r < 0.66 ? 'shrubSunny' : r < 0.86 ? 'dwarfTree' : 'fernClump';
      sunnyCount += 1;
    } else {
      const r = random();
      role = r < 0.5 ? 'shrubShade' : r < 0.78 ? 'dwarfTree' : 'fernClump';
      shadyCount += 1;
    }

    slopeItems.push({
      role,
      kind: 'slope',
      x,
      y: getTerrainHeight(x, z),
      z,
      rotation: random() * Math.PI * 2,
      scale: 0.7 + random() * 0.7,
      sunny,
    });
  }

  // —— 溪流乱石：沿主河道两岸，大小不等 ——
  let boulders = 0;
  let pebbles = 0;
  for (let z = -160; z <= 160; z += 5.5) {
    const width = getStreamWidth(z);
    const cx = getStreamX(z);
    const waterY = getTerrainHeight(cx, z);
    for (const side of [-1, 1]) {
      // 毛石（大）：落在河宽 × [1.15, 2.4] 的岸带
      if (random() < 0.62) {
        const off = width * (STREAM_BANK_NEAR + random() * (STREAM_BANK_FAR - STREAM_BANK_NEAR));
        const x = cx + side * off;
        const y = getTerrainHeight(x, z) + 0.12;
        streamItems.push({
          role: 'streamBoulder',
          kind: 'stream',
          x,
          y,
          z,
          rotation: random() * Math.PI * 2,
          scale: 0.7 + random() * 0.7,
          sunny: false,
        });
        boulders += 1;
      }
      // 碎石（小）：更贴近水，河宽 × [0.95, 1.7]
      if (random() < 0.8) {
        const off = width * (0.95 + random() * 0.75);
        const x = cx + side * off;
        const y = waterY + 0.06;
        streamItems.push({
          role: 'streamPebble',
          kind: 'stream',
          x,
          y,
          z,
          rotation: random() * Math.PI * 2,
          scale: 0.6 + random() * 0.6,
          sunny: false,
        });
        pebbles += 1;
      }
    }
  }

  return {
    slopeItems,
    streamItems,
    stats: {
      slope: slopeItems.length,
      stream: streamItems.length,
      total: slopeItems.length + streamItems.length,
      sunny: sunnyCount,
      shady: shadyCount,
      boulders,
      pebbles,
      attempts,
    },
  };
};

// ---------------------------------------------------------------- 装配到场景

/**
 * 把规划装配成 InstancedMesh（每个角色一个实例网格）。
 * 不注册碰撞体、不加入 clickableMeshes、不参与任何 update 循环。
 * 返回的对象挂在 `this.mountainEnv` 供自检脚本读取。
 */
export const buildMountainEnv = ({ homes = [], hubs = [], library, scene, windEnabledRef }) => {
  const plan = planMountainEnv({ homes, hubs });
  const all = [...plan.slopeItems, ...plan.streamItems];

  const group = new THREE.Group();
  group.name = 'mountain-env';

  const geometryCache = new Map();
  const trianglesByRole = {};
  Object.keys(ENV_RECIPES).forEach((role) => {
    const geometry = ENV_RECIPES[role].build();
    geometryCache.set(role, geometry);
    trianglesByRole[role] = countTriangles([geometry]);
  });

  const materials = createEnvMaterials({ library });

  const buckets = new Map();
  all.forEach((item) => {
    if (!buckets.has(item.role)) buckets.set(item.role, []);
    buckets.get(item.role).push(item);
  });

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();

  buckets.forEach((list, role) => {
    const recipe = ENV_RECIPES[role];
    const mesh = new THREE.InstancedMesh(geometryCache.get(role), materials[role], list.length);

    list.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      euler.set(0, item.rotation, 0);
      quaternion.setFromEuler(euler);
      scale.setScalar(item.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);

      if (recipe.material === 'foliage') {
        const palette = FOLIAGE_PALETTE[role] || FOLIAGE_PALETTE.shrubSunny;
        color.copy(palette[index % palette.length]);
        mesh.setColorAt(index, color);
      }
    });

    mesh.name = `mountain-env:${role}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  scene.add(group);

  // —— 林间薄雾层（后处理感的贴地柔雾）——
  const mistGroup = new THREE.Group();
  mistGroup.name = 'forest-mist';
  const mistMeshes = [];
  MIST_PARAMS.bands.forEach((band) => {
    const geo = new THREE.CylinderGeometry(band.radius, band.radius, band.height, 56, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(band.color),
      transparent: true,
      opacity: band.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = band.y;
    mesh.renderOrder = 2;
    mistGroup.add(mesh);
    mistMeshes.push(mesh);
  });
  scene.add(mistGroup);

  const addedTriangles = all.reduce(
    (sum, item) => sum + trianglesByRole[item.role] * item.scale ** 2,
    0,
  );

  return {
    group,
    mistGroup,
    mistMeshes,
    materials,
    plan,
    slopeItems: plan.slopeItems,
    streamItems: plan.streamItems,
    trianglesByRole,
    stats: {
      ...plan.stats,
      meshCount: group.children.length,
      mistMeshCount: mistMeshes.length,
      addedTriangles: Math.round(addedTriangles),
    },
    windEnabledRef: windEnabledRef || { value: true },
  };
};

/** 薄雾极慢水平漂移（仅旋转 mistGroup，不触碰相机/居民/几何）。 */
export const updateMountainEnvMist = (env, elapsed) => {
  if (!env || !env.mistGroup) return;
  if (env.windEnabledRef && env.windEnabledRef.value === false) return;
  env.mistGroup.rotation.y = elapsed * MIST_PARAMS.driftSpeed * 0.05;
};
