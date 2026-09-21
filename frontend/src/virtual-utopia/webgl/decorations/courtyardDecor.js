/**
 * 庭院装饰小品（视觉层）—— 台地 / 临溪 / 崖边 三套宅院的差异化轻量化小品。
 *
 * 硬性约束（本模块的设计前提）
 *  - **只做视觉**：不注册碰撞体（本工程 webgl 层本就没有碰撞系统）、不加入 `clickableMeshes`、
 *    不改房屋主体几何、不改地块坐标与宅院边界（`home.*` 只读）。
 *  - **单物件三角面 300–800**：7 个配方均按此区间设计，实测 304–420。
 *  - **不新增动画**：全部 InstancedMesh + 静态矩阵，不参与任何 update 循环。
 *  - **不侵占居民活动范围**：落位以「房屋主体包围盒边沿 + 安全退让」为起点向外偏移，
 *    并以「该户底盘实际半径」为硬上限；不越出台基、不逼近漫游半径外缘、不新增任何阻挡物。
 *  - **不新增显存**：材质复用 `manorMaterials` 的共享程序化贴图（stone / slab / bamboo）。
 *
 * 差异化偏好
 *  - 台地 terrace / 森林 forest：石凳 + 小片果树灌丛（开阔、向阳、有人烟）
 *  - 临溪 stream          ：岸边景观石 + 矮竹丛（亲水、轻盈）
 *  - 崖边 cliff           ：大块毛石 + 简易石灯（粗粝、隐居）
 *  - 三类都沿入户动线铺石板，保持同一门派语汇
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MANOR_GROUP_TINTS } from '../materials/manorMaterials.js';

// ---------------------------------------------------------------- 可调常量

/**
 * 摆放基准：**以房屋主体的 XZ 包围盒边沿为起点向外偏移**，而不是绕宅院中心画等半径圆。
 * 原因：房屋是矩形，绕中心画圆会在对角方向"切进"墙里；沿包围盒边沿偏移则天然避开墙，
 * 也能自动适配每户不同的底盘大小。
 */
export const RING_FACTOR = { min: 0.72, max: 0.99 };

/** 半径硬上限系数：小品的落点半径不得超过「底盘半径 × 该系数」，保证仍落在台基上。 */
export const PLATFORM_MAX_FACTOR = 0.99;

/** 与房屋主体（其水平半径之外）的退让距离（米）：确保不贴墙、不穿模。 */
export const HOUSE_MARGIN = 0.4;

/** 新小品之间、以及新小品与既有庭院小品之间的最小间距（米）。 */
/** 小品之间、以及小品与既有庭院小品之间的额外间隙（米）—— 在"各自半径之和"之上再加的安全缝。 */
export const DECOR_GAP = 0.15;
export const PROP_GAP = 0.1;

/** 角度槽位数（全周均分）：保证同户小品环绕分布、彼此拉开。 */
const ANGLE_SLOTS = 12;
/** 每处小品的重采样次数（落位不合法时重试，仍不合法则放弃该件）。 */
const MAX_PLACEMENT_TRIES = 14;

/** 单物件三角面区间（硬性约束）。 */
export const TRI_BUDGET = { min: 300, max: 800 };

// ---------------------------------------------------------------- 三角面工具

/** 精确统计一组几何体的三角面数。 */
export const countTriangles = (geometries) =>
  geometries.reduce((sum, geometry) => {
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    if (index) return sum + index.count / 3;
    return sum + (position ? position.count / 3 : 0);
  }, 0);

/** 每个角色的「水平半径」（取几何包围球在地面上的投影半径，用于不重叠判定）。 */
const FOOTPRINT_CACHE = new Map();

export const decorFootprint = (role) => {
  if (FOOTPRINT_CACHE.has(role)) return FOOTPRINT_CACHE.get(role);
  const recipe = DECOR_RECIPES[role];
  let footprint = 0.4;
  if (recipe) {
    const geometry = recipe.build();
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    footprint = sphere ? sphere.radius : 0.4;
  }
  FOOTPRINT_CACHE.set(role, footprint);
  return footprint;
};

/**
 * 几何体落地对齐：把包围盒底面压到 y=0、水平中心移到 x=z=0。
 * 这样实例矩阵里的 y 就等于"地面高度"，小品不会浮空或陷地。
 */
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

/**
 * 合并多块几何为一个（InstancedMesh 需要单一 geometry）。
 * three 的基础几何里 Box/Cylinder/Cone 带索引、Icosahedron/Sphere 不带，
 * 混着 merge 会失败 —— 统一转非索引再合并（顶点数略增，小物件无所谓）。
 */
const mergeOrFirst = (parts) => {
  const normalized = parts.map((part) => (part.getIndex() ? part.toNonIndexed() : part));
  const merged = mergeGeometries(normalized, false);
  if (merged) return merged;
  console.warn('[courtyard-decor] 几何合并失败，退回首个部件');
  return normalized[0];
};

// ---------------------------------------------------------------- 7 个配方（每个都实测落在 300–800 面）

/** 石凳：座面 + 两条石腿。 */
const buildStoneStool = () => {
  const seat = new THREE.BoxGeometry(0.86, 0.14, 0.40, 6, 3, 4);
  seat.translate(0, 0.41, 0);
  const legA = new THREE.BoxGeometry(0.13, 0.34, 0.30, 2, 2, 2);
  legA.translate(-0.30, 0.17, 0);
  const legB = legA.clone();
  legB.translate(0.60, 0, 0);
  return groundAlign(mergeOrFirst([seat, legA, legB]));
};

/** 石板：一块扁平、顶面略起伏的汀步石。 */
const buildStoneSlab = () => {
  const slab = new THREE.BoxGeometry(1.05, 0.09, 0.72, 8, 2, 6);
  const position = slab.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > 0.02) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(
        i,
        position.getY(i) + Math.sin(x * 3.1) * 0.012 + Math.cos(z * 2.7) * 0.01,
      );
    }
  }
  position.needsUpdate = true;
  return groundAlign(slab);
};

/** 矮竹丛：7 根竹竿 + 轻微倾斜。 */
const buildBambooClump = () => {
  const parts = [];
  [
    [0, 0, 1.0, 0],
    [0.14, 0.08, 0.86, 0.12],
    [-0.13, 0.11, 0.9, 0.1],
    [0.07, -0.15, 0.78, 0.1],
    [-0.1, -0.12, 0.82, 0.14],
    [0.2, -0.05, 0.7, 0.08],
    [-0.2, 0.0, 0.66, 0.06],
  ].forEach(([x, z, height, lean]) => {
    const stalk = new THREE.CylinderGeometry(0.026, 0.032, 1.35 * height, 6, 3);
    stalk.rotateZ(lean);
    stalk.rotateX(lean * 0.6);
    stalk.translate(x, 0.675 * height, z);
    parts.push(stalk);
  });
  return groundAlign(mergeOrFirst(parts));
};

/** 小型景观石：1 块主石 + 2 块配石 + 1 块碎石。 */
const buildLandscapeRock = () => {
  const main = new THREE.IcosahedronGeometry(0.40, 1);
  main.scale(1.15, 0.82, 1.0);
  main.translate(0, 0.30, 0);
  const sideA = new THREE.IcosahedronGeometry(0.22, 1);
  sideA.scale(1.1, 0.75, 1.0);
  sideA.translate(0.48, 0.15, 0.10);
  const sideB = new THREE.IcosahedronGeometry(0.18, 1);
  sideB.scale(1.0, 0.7, 1.15);
  sideB.translate(-0.40, 0.12, -0.14);
  const chip = new THREE.IcosahedronGeometry(0.13, 2);
  chip.translate(0.20, 0.09, -0.42);
  return groundAlign(mergeOrFirst([main, sideA, sideB, chip]));
};

/** 大块毛石：体量更大、面相更碎的粗粝岩块（崖边专用）。 */
const buildBoulder = () => {
  const parts = [];
  [
    [0, 0, 0.56, 1, 1.25, 0.74, 1.0],
    [0.42, 0.22, 0.30, 1, 1.05, 0.8, 1.1],
    [-0.34, -0.24, 0.26, 1, 1.0, 0.72, 1.05],
    [0.06, -0.4, 0.20, 1, 1.0, 1.0, 1.0],
    [-0.16, 0.36, 0.15, 0, 1.0, 1.0, 1.0],
  ].forEach(([x, z, radius, detail, sx, sy, sz]) => {
    const rock = new THREE.IcosahedronGeometry(radius, detail);
    rock.scale(sx, sy, sz);
    rock.translate(x, radius * sy * 0.78, z);
    parts.push(rock);
  });
  return groundAlign(mergeOrFirst(parts));
};

/** 简易石灯：基础 + 灯柱 + 台面 + 灯室 + 檐 + 顶珠（无光源、无动画）。 */
const buildStoneLantern = () => {
  const base = new THREE.CylinderGeometry(0.26, 0.30, 0.14, 10, 2);
  base.translate(0, 0.07, 0);
  const shaft = new THREE.CylinderGeometry(0.09, 0.11, 0.52, 8, 3);
  shaft.translate(0, 0.40, 0);
  const platform = new THREE.CylinderGeometry(0.30, 0.26, 0.10, 10, 2);
  platform.translate(0, 0.71, 0);
  const box = new THREE.BoxGeometry(0.30, 0.28, 0.30, 3, 3, 3);
  box.translate(0, 0.90, 0);
  const roof = new THREE.ConeGeometry(0.34, 0.22, 8, 2);
  roof.translate(0, 1.15, 0);
  const finial = new THREE.IcosahedronGeometry(0.06, 0);
  finial.translate(0, 1.29, 0);
  return groundAlign(mergeOrFirst([base, shaft, platform, box, roof, finial]));
};

/** 小片果树灌丛：矮树干 + 两团冠 + 4 颗果。 */
const buildFruitShrub = () => {
  const trunk = new THREE.CylinderGeometry(0.07, 0.095, 0.62, 6, 2);
  trunk.translate(0, 0.31, 0);
  const canopyA = new THREE.IcosahedronGeometry(0.40, 1);
  canopyA.scale(1.05, 0.9, 1.0);
  canopyA.translate(0, 0.78, 0);
  const canopyB = new THREE.IcosahedronGeometry(0.26, 1);
  canopyB.scale(1.0, 0.85, 1.05);
  canopyB.translate(0.28, 0.60, 0.14);
  const fruits = [];
  [
    [0.22, 0.86, 0.18],
    [-0.24, 0.80, -0.12],
    [0.06, 0.66, -0.30],
    [-0.10, 0.92, 0.22],
  ].forEach(([x, y, z]) => {
    const fruit = new THREE.SphereGeometry(0.065, 6, 4);
    fruit.translate(x, y, z);
    fruits.push(fruit);
  });
  return groundAlign(mergeOrFirst([trunk, canopyA, canopyB, ...fruits]));
};

/**
 * 配方表。`flat: true` 的沿入户动线铺（贴地）；其余按全周槽位摆。
 * `material` 指向 `manorMaterials` 的共享贴图键（复用即 0 额外显存）。
 */
export const DECOR_RECIPES = {
  stool: { label: '石凳', build: buildStoneStool, material: 'stone', flat: false, tint: '#8f8c86', roughness: 0.98, bumpScale: 0.06 },
  slab: { label: '石板', build: buildStoneSlab, material: 'slab', flat: true, tint: '#a9a49c', roughness: 0.94, bumpScale: 0.05 },
  bambooClump: { label: '矮竹丛', build: buildBambooClump, material: 'bamboo', flat: false, tint: '#9a9a74', roughness: 0.92, bumpScale: 0.035 },
  landscapeRock: { label: '小型景观石', build: buildLandscapeRock, material: 'stone', flat: false, tint: '#85827c', roughness: 1.0, bumpScale: 0.07 },
  stoneLantern: { label: '简易石灯', build: buildStoneLantern, material: 'stone', flat: false, tint: '#96938c', roughness: 0.98, bumpScale: 0.06 },
  boulder: { label: '大块毛石', build: buildBoulder, material: 'stone', flat: false, tint: '#7d7a75', roughness: 1.0, bumpScale: 0.08 },
  fruitShrub: { label: '果树灌丛', build: buildFruitShrub, material: 'bamboo', flat: false, tint: '#7f9a6a', roughness: 0.95, bumpScale: 0.05 },
};

// 把角色名回填进配方，避免调用方到处传 key
Object.entries(DECOR_RECIPES).forEach(([key, recipe]) => {
  recipe.role = key;
});

/** 三类宅院的小品偏好（森林组团复用台地语汇，保持 50 处宅院全覆盖）。 */
export const GROUP_DECOR_SETS = {
  terrace: [
    { role: 'stool', count: 2 },
    { role: 'fruitShrub', count: 2 },
    { role: 'slab', count: 2 },
  ],
  stream: [
    { role: 'landscapeRock', count: 2 },
    { role: 'bambooClump', count: 2 },
    { role: 'slab', count: 2 },
  ],
  cliff: [
    { role: 'boulder', count: 2 },
    { role: 'stoneLantern', count: 1 },
    { role: 'slab', count: 2 },
  ],
  forest: [
    { role: 'stool', count: 1 },
    { role: 'fruitShrub', count: 2 },
    { role: 'landscapeRock', count: 1 },
    { role: 'slab', count: 2 },
  ],
};

// ---------------------------------------------------------------- 材质（复用共享贴图）

/**
 * 建立小品材质集：全部复用 `manorMaterials` 的共享贴图（map / bumpMap / roughnessMap），
 * 只换基色与粗糙度 → **额外显存 0**，且每个「组团 × 角色」只有 1 份材质。
 */
export const createDecorMaterials = ({ library, group }) => {
  const textures = library?.textures || {};
  const groupTints = MANOR_GROUP_TINTS[group] || {};
  const materials = {};

  Object.entries(DECOR_RECIPES).forEach(([role, recipe]) => {
    const set = textures[recipe.material] || null;
    const base = new THREE.Color(recipe.tint);
    const groupColor = groupTints[recipe.material]
      ? new THREE.Color(groupTints[recipe.material])
      : null;
    const color = groupColor ? base.clone().lerp(groupColor, 0.35) : base;

    materials[role] = new THREE.MeshStandardMaterial({
      color,
      roughness: recipe.roughness,
      metalness: 0,
      map: set ? set.map : null,
      bumpMap: set ? set.bump : null,
      bumpScale: set ? recipe.bumpScale : 0,
      roughnessMap: set ? set.roughness : null,
      dithering: true,
    });
    materials[role].name = `decor-${role}:${group}`;
  });

  return materials;
};

// ---------------------------------------------------------------- 落位

/** 确定性随机（同一 home.number 每次得到同一套摆放，便于复现与自检）。 */
const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 落点离宅院中心的距离是否已越过「房屋主体半径 + 退让」（贴墙 / 穿模就靠这条挡掉）。 */
const clearsHouseBody = (radius, floor) =>
  !floor.bodyRadius || radius > floor.bodyRadius + HOUSE_MARGIN;

/**
 * 单件落位：
 *  半径 ∈ 底盘半径 × [RING_FACTOR.min, RING_FACTOR.max]（保证落在台基环带上），
 *  且必须越过「房屋主体半径 + 退让」（保证不贴墙、不穿模）。
 * 直立小品按全周 ANGLE_SLOTS 槽均分取角并逐次顺延 —— 矩形房屋的可放方向集中在
 * 靠近世界坐标轴的两侧扇区，固定槽位会大量落空；石板沿入户方向成线。
 */
const pushPlacement = ({
  home,
  floor,
  placements,
  skipped,
  reasons,
  random,
  avoidPoints,
  role,
  angle,
  slot,
  jitter,
}) => {
  const recipe = DECOR_RECIPES[role];
  /**
   * 环带显式算出来，而不是"整段采样再逐个否掉"：
   *  下界 = max(底盘 × RING_MIN, 房屋主体半径 + 退让)  ← 保证既不贴墙、也不越出台基
   *  上界 = 底盘 × min(RING_MAX, PLATFORM_MAX_FACTOR)
   * 两者交叉则说明这户确实没有可放空间（底盘太小 / 主体太大），直接记为 noRoom 跳过。
   */
  const radiusMin = Math.max(
    floor.clear * RING_FACTOR.min,
    (floor.bodyRadius || 0) + HOUSE_MARGIN,
  );
  const radiusMax = floor.clear * Math.min(RING_FACTOR.max, PLATFORM_MAX_FACTOR);

  if (radiusMax <= radiusMin) {
    reasons.noRoom += 1;
    skipped.push({ homeId: home.id, group: home.group, role });
    return;
  }

  const scale = 0.92 + random() * 0.18;
  const selfFootprint = decorFootprint(role) * scale;

  for (let attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt += 1) {
    const baseAngle =
      angle !== undefined ? angle : ((slot + attempt) / ANGLE_SLOTS) * Math.PI * 2;
    const theta = baseAngle + (random() - 0.5) * jitter * 2;
    const radius = radiusMin + random() * Math.max(0.01, radiusMax - radiusMin);
    const x = home.x + Math.cos(theta) * radius;
    const z = home.z + Math.sin(theta) * radius;

    if (!clearsHouseBody(radius, floor)) {
      reasons.wall += 1;
      continue;
    }

    // 与已摆放小品不重叠：两侧都用「各自水平半径 + 间隙」判，而不是拍一个固定间距
    const overlapsDecor = placements.some(
      (item) =>
        Math.hypot(item.x - x, item.z - z) <
        selfFootprint + decorFootprint(item.role) * item.scale + DECOR_GAP,
    );
    if (overlapsDecor) {
      reasons.decor += 1;
      continue;
    }

    // 与既有庭院小品（石块 / 矮篱 / 菜畦…）不重叠：既有小品也带各自的实测半径
    const overlapsExisting = avoidPoints.some(
      (point) =>
        Math.hypot(point.x - x, point.z - z) <
        selfFootprint + (point.radius || 0) + PROP_GAP,
    );
    if (overlapsExisting) {
      reasons.existing += 1;
      continue;
    }

    placements.push({
      homeId: home.id,
      group: home.group,
      role,
      x,
      y: floor.top + (recipe.flat ? 0.01 : 0),
      z,
      radius,
      rotation: theta + Math.PI / 2,
      scale,
      flat: Boolean(recipe.flat),
    });
    return;
  }

  skipped.push({ homeId: home.id, group: home.group, role });
};

/**
 * 为所有宅院生成小品摆放方案（纯计算，不碰场景）。
 *
 * @param homes        宅基清单（只读 home.id / home.x / home.z / home.number / home.group）
 * @param homeSurface  (home) => { clear, top, houseBox }
 *                     clear    = 底盘（平台/地面光圈）水平半径 —— 落位半径的硬上限基准
 *                     top      = 底盘顶面高度 —— 小品落地的 y
 *                     bodyRadius = 房屋主体的水平半径 —— "不贴墙"退让的基准
 * @param avoidPoints  既有庭院小品的世界坐标 [{ x, z }]
 */
export const planCourtyardDecor = ({ homes, homeSurface, avoidPoints = [] }) => {
  const placements = [];
  const skipped = [];
  const reasons = { wall: 0, decor: 0, existing: 0, noRoom: 0 };
  const padding = { terrace: 11, stream: 23, cliff: 37, forest: 53 };

  homes.forEach((home) => {
    const set = GROUP_DECOR_SETS[home.group] || GROUP_DECOR_SETS.terrace;
    const surface = homeSurface ? homeSurface(home) : null;
    const floor = {
      clear: surface?.clear || 4.2,
      top: surface?.top ?? 0,
      bodyRadius: surface?.bodyRadius || 0,
    };
    const random = mulberry32((home.number || 1) * 7919 + (padding[home.group] || 7));
    const outward = Math.atan2(home.z, home.x);

    const items = [];
    set.forEach((entry) => {
      if (!DECOR_RECIPES[entry.role]) return;
      for (let i = 0; i < entry.count; i += 1) items.push({ role: entry.role, index: i });
    });

    const flats = items.filter((item) => DECOR_RECIPES[item.role].flat);
    const uprights = items.filter((item) => !DECOR_RECIPES[item.role].flat);

    // ① 先铺「入户石径」：沿离家向外的方向铺出去（像一条通往宅门的石径）
    flats.forEach((item, order) => {
      pushPlacement({
        home,
        floor,
        placements,
        skipped,
        reasons,
        random,
        avoidPoints,
        role: item.role,
        angle: outward + (order - (flats.length - 1) / 2) * 0.3,
        jitter: 0.55,
      });
    });

    // ② 再摆「院内外沿小品」：全周 12 槽均分；配合"沿墙退让"的半径，
    //    能用的方向自然命中（对角方向因墙角更远、超出台基而被自动跳过）。
    uprights.forEach((item, order) => {
      pushPlacement({
        home,
        floor,
        placements,
        skipped,
        reasons,
        random,
        avoidPoints,
        role: item.role,
        slot: order,
        jitter: 0.18,
      });
    });
  });

  const byRole = {};
  const byGroup = {};
  const byHome = {};
  placements.forEach((item) => {
    byRole[item.role] = (byRole[item.role] || 0) + 1;
    byGroup[item.group] = (byGroup[item.group] || 0) + 1;
    byHome[item.homeId] = (byHome[item.homeId] || 0) + 1;
  });

  const radii = placements.map((i) => i.radius);

  return {
    placements,
    skipped,
    stats: {
      total: placements.length,
      skipped: skipped.length,
      reasons,
      homes: homes.length,
      homesCovered: Object.keys(byHome).length,
      byRole,
      byGroup,
      radius: radii.length
        ? {
            min: Number(Math.min(...radii).toFixed(3)),
            max: Number(Math.max(...radii).toFixed(3)),
          }
        : null,
    },
  };
};

// ---------------------------------------------------------------- 装配到场景

/**
 * 把摆放方案装配成 InstancedMesh（每个「组团 × 角色」一个实例网格）。
 * 不注册碰撞体、不加入 clickableMeshes、不参与任何 update 循环。
 */
export const buildCourtyardDecor = ({
  homes,
  homeBounds,
  avoidPoints = [],
  library,
  scene,
}) => {
  const { placements, skipped, stats } = planCourtyardDecor({
    homes,
    homeSurface: homeBounds,
    avoidPoints,
  });

  const group = new THREE.Group();
  group.name = 'courtyard-decor';

  const geometryCache = new Map();
  const trianglesByRole = {};
  Object.keys(DECOR_RECIPES).forEach((role) => {
    const geometry = DECOR_RECIPES[role].build();
    geometryCache.set(role, geometry);
    trianglesByRole[role] = countTriangles([geometry]);
  });

  const buckets = new Map();
  placements.forEach((item) => {
    const key = `${item.group}|${item.role}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  });

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const materialCache = new Map();

  buckets.forEach((list, key) => {
    const [groupName, role] = key.split('|');
    if (!materialCache.has(groupName)) {
      materialCache.set(groupName, createDecorMaterials({ library, group: groupName }));
    }
    const mesh = new THREE.InstancedMesh(
      geometryCache.get(role),
      materialCache.get(groupName)[role],
      list.length,
    );

    list.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      euler.set(0, item.rotation, 0);
      quaternion.setFromEuler(euler);
      scale.setScalar(item.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.name = `courtyard-decor:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  scene.add(group);

  const addedTriangles = placements.reduce(
    (sum, item) => sum + trianglesByRole[item.role] * item.scale ** 2,
    0,
  );

  const footprints = {};
  Object.keys(DECOR_RECIPES).forEach((role) => {
    footprints[role] = decorFootprint(role);
  });

  return {
    group,
    placements,
    skipped,
    trianglesByRole,
    footprints,
    stats: {
      ...stats,
      meshCount: group.children.length,
      materials: [...materialCache.values()].reduce(
        (n, set) => n + Object.keys(set).length,
        0,
      ),
      addedTriangles: Math.round(addedTriangles),
    },
  };
};
