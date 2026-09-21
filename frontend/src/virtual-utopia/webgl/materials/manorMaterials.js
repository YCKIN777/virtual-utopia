/**
 * 宋式诧寂山居 · 宅院材质方案（低饱和哑光 / 程序化贴图 / 材质复用）
 *
 * 设计要点
 *  - 只负责「建筑与庭院小品」的材质，不改任何几何、坐标、碰撞、逻辑。
 *  - 全部使用内建 MeshStandardMaterial（无自定义 shader），只用 map + bumpMap + roughnessMap + 少量参数。
 *  - 贴图**程序化生成**（CanvasTexture，默认 1024²），零二进制资源、可复现、无网络依赖。
 *  - 颜色贴图同时用作凹凸图（成本 0 显存），需要更精细时可换成手作 normalMap。
 *  - 额外一张 **roughnessMap**：把"斑驳/风化/瓦缝/石面"翻成粗糙度差异，
 *    让哑光表面在高光上有层次（仍属标准 PBR 通道，非自定义 shader）。
 *  - 材质按 `role:group` **缓存复用**：30+ 栋宅院共享同一批材质（原来每网格 clone ⇒ 数百份）。
 *
 * 角色（role）
 *  - earth  夯土墙面：颗粒 + 夯层 + 细裂纹 + 斑驳
 *  - timber 原木梁柱：竖向木纹深浅变化 + 木节 + 轻微磨痕
 *  - tile   青灰瓦顶：瓦垄/瓦缝 + 边缘风化缺角 + 青灰哑光
 *  - stone  毛石地基：不规则石块 + 深灰缝 + 石面孔隙
 *  - slab   石板/平台：复用毛石贴图、提亮降粗糙（示范「材质复用」）
 *  - bamboo 竹篱：竹节 + 竹身明暗
 *  - glass / foliage：保持既有逻辑，不在本模块接管
 */

import * as THREE from 'three';

// ---------------------------------------------------------------- 调参入口

/** 贴图边长。移动端可降到 512（显存 1/4）。 */
export const MANOR_TEXTURE_SIZE = 1024;

/** 复用颜色贴图当凹凸图（省一半显存）。设为 false 则额外生成灰度凹凸图。 */
export const MANOR_SHARE_COLOR_AS_BUMP = true;

/**
 * 是否生成 roughnessMap（1024²，每角色一张）。
 * 作用：把「斑驳 / 风化 / 瓦缝 / 石面孔隙」翻成粗糙度差异 —— 哑光表面因此有了高光层次，
 * 是"提升材质真实感"最省钱的一步（标准 PBR 通道，无 shader、无动画）。
 * 移动端显存紧张可置 false：材质会退回「整块恒定粗糙度」，观感略平但功能不变。
 */
export const MANOR_ROUGHNESS_MAP = true;

/**
 * 各角色粗糙度调制带（**乘在 MANOR_ROLE_PRESETS.roughness 上**，1.0 = 不变）。
 * 贴图越暗（越风化 / 越是缝隙）→ 越接近 band 上界（更粗糙、更哑）。
 * 映射公式：roughnessMap = 1 - (1 - lum)^gamma，再线性压到 [band[0], band[1]]。
 */
export const ROLE_ROUGHNESS_BAND = {
  earth: [0.78, 1.0, 1.0], // 夯土：斑驳处颗粒外露 → 更粗糙
  timber: [0.8, 1.0, 1.1], // 原木：深木纹处吸光、浅木纹处略有木脂微光
  tile: [0.72, 1.0, 0.9], // 青灰瓦：瓦面残留釉光 vs 风化缺角，对比最明显
  stone: [0.84, 1.0, 1.0], // 毛石：灰缝极粗糙、石面略平
  bamboo: [0.8, 1.0, 1.0], // 竹篱：竹节处最粗糙
};

/** 角色识别阈值（sRGB 感知亮度）。改这两个数即可整体调整"哪块算瓦 / 哪块算夯土"。 */
export const ROLE_LUMINANCE = { tile: 88, earth: 125 };

/** 手动覆盖：颜色 hex → 角色。用于个别网格分错时的兜底（例如 { 'a97945': 'timber' }）。 */
export const ROLE_COLOR_OVERRIDES = {};

/** 低饱和哑光参数预设（颜色为组内基准色，实际取 MANOR_GROUP_TINTS）。 */
export const MANOR_ROLE_PRESETS = {
  earth: { color: '#c3b39a', roughness: 0.98, metalness: 0, bumpScale: 0.05, repeat: [1.4, 1.4] },
  timber: { color: '#a8834f', roughness: 0.9, metalness: 0, bumpScale: 0.04, repeat: [2, 2] },
  tile: { color: '#6e7773', roughness: 0.85, metalness: 0, bumpScale: 0.06, repeat: [1, 3] },
  stone: { color: '#8f8c86', roughness: 1.0, metalness: 0, bumpScale: 0.07, repeat: [1, 1] },
  slab: {
    color: '#a9a49c',
    roughness: 0.94,
    metalness: 0,
    bumpScale: 0.05,
    repeat: [1, 1],
    texture: 'stone',
  },
  bamboo: { color: '#9a9a74', roughness: 0.92, metalness: 0, bumpScale: 0.04, repeat: [2, 1] },
};

/** 组团色偏：保持原有"每组略有差异"的观感，但整体压低饱和度。 */
export const MANOR_GROUP_TINTS = {
  cliff: { earth: '#c0b096', timber: '#a07a49', tile: '#6b7472', stone: '#8b8781', slab: '#a6a19a', bamboo: '#979772' },
  forest: { earth: '#bfb298', timber: '#8f6c40', tile: '#6a7270', stone: '#89857f', slab: '#a3a099', bamboo: '#94946e' },
  terrace: { earth: '#c6b69c', timber: '#ab8654', tile: '#707976', stone: '#918e88', slab: '#aca79f', bamboo: '#9c9c76' },
  stream: { earth: '#c0b59f', timber: '#a17f52', tile: '#6d7775', stone: '#8c8983', slab: '#a7a29b', bamboo: '#969874' },
};

// ---------------------------------------------------------------- 工具

/** 确定性随机（同一 seed 每次生成同一张图）。 */
const mulberry32 = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createCanvas = (size) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
};

const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

const speckle = (ctx, size, random, count, alpha) => {
  for (let i = 0; i < count; i += 1) {
    const light = random() > 0.5;
    const value = light ? 236 : 96;
    ctx.fillStyle = rgba(value, value - 6, value - 16, alpha * (0.4 + random() * 0.6));
    const s = random() > 0.85 ? 2 : 1;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
};

const softBlotches = (ctx, size, random, count, tint, maxAlpha) => {
  for (let i = 0; i < count; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = size * (0.03 + random() * 0.1);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(tint[0], tint[1], tint[2], maxAlpha * (0.35 + random() * 0.65)));
    grad.addColorStop(1, rgba(tint[0], tint[1], tint[2], 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const cracks = (ctx, size, random, count, dark) => {
  ctx.lineCap = 'round';

  for (let i = 0; i < count; i += 1) {
    let x = random() * size;
    let y = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 3 + ((random() * 5) | 0);

    for (let s = 0; s < segments; s += 1) {
      x += (random() - 0.5) * size * 0.09;
      y += (random() - 0.45) * size * 0.13;
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = rgba(dark[0], dark[1], dark[2], 0.14 + random() * 0.12);
    ctx.lineWidth = random() > 0.7 ? 1.6 : 1;
    ctx.stroke();
  }
};

// ---------------------------------------------------------------- 五张程序化贴图

/** 夯土：颗粒 + 夯层 + 细裂纹 + 斑驳（低饱和暖灰）。 */
const drawEarth = (ctx, size, random) => {
  ctx.fillStyle = '#c3b39a';
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < 11; row += 1) {
    const h = size / 11;
    ctx.fillStyle = rgba(150 + random() * 34, 136 + random() * 30, 112 + random() * 26, 0.18);
    ctx.fillRect(0, row * h + random() * h * 0.35, size, h * (0.45 + random() * 0.5));
  }

  softBlotches(ctx, size, random, 54, [120, 104, 80], 0.16);
  softBlotches(ctx, size, random, 30, [222, 210, 188], 0.14);
  speckle(ctx, size, random, size * 12, 0.16);
  cracks(ctx, size, random, 26, [96, 82, 62]);

  // 秸秆/砂粒：短浅色划痕
  for (let i = 0; i < 90; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const angle = random() * Math.PI;
    const length = 3 + random() * 9;
    ctx.strokeStyle = rgba(228, 214, 188, 0.18 + random() * 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
};

/** 原木：竖向木纹深浅变化 + 木节 + 轻微使用磨痕。 */
const drawTimber = (ctx, size, random) => {
  ctx.fillStyle = '#a8834f';
  ctx.fillRect(0, 0, size, size);

  for (let band = 0; band < 14; band += 1) {
    const w = size / 14;
    ctx.fillStyle = rgba(150 + random() * 40, 118 + random() * 30, 74 + random() * 22, 0.14);
    ctx.fillRect(band * w + random() * w * 0.4, 0, w * (0.4 + random() * 0.6), size);
  }

  for (let i = 0; i < 300; i += 1) {
    const x = random() * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    const wobble = 6 + random() * 12;

    for (let y = 0; y <= size; y += size / 8) {
      ctx.lineTo(x + Math.sin(y * 0.02 + random() * 6) * wobble, y);
    }

    ctx.strokeStyle = rgba(78, 58, 36, 0.05 + random() * 0.16);
    ctx.lineWidth = random() > 0.82 ? 1.8 : 0.9;
    ctx.stroke();
  }

  for (let i = 0; i < 3; i += 1) {
    const cx = random() * size;
    const cy = random() * size;
    for (let ring = 3; ring >= 1; ring -= 1) {
      ctx.strokeStyle = rgba(70, 50, 30, 0.18);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ring * size * 0.012 * (0.5 + random() * 0.5), ring * size * 0.03, random() * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  softBlotches(ctx, size, random, 24, [64, 46, 28], 0.12);
  speckle(ctx, size, random, size * 4, 0.1);
};

/** 青灰瓦：瓦垄/瓦缝 + 边缘风化缺角 + 哑光青灰。 */
const drawTile = (ctx, size, random) => {
  ctx.fillStyle = '#6e7773';
  ctx.fillRect(0, 0, size, size);

  const rows = 7;
  const rowHeight = size / rows;
  const columns = 9;
  const columnWidth = size / columns;

  for (let row = 0; row < rows; row += 1) {
    const y = row * rowHeight;
    ctx.fillStyle = rgba(110 + random() * 22, 120 + random() * 20, 118 + random() * 18, 0.22);
    ctx.fillRect(0, y, size, rowHeight);

    // 瓦垄顶部凹缝（瓦缝）
    ctx.fillStyle = rgba(58, 66, 66, 0.5);
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = rgba(96, 106, 104, 0.28);
    ctx.fillRect(0, y + 3, size, 2);

    // 竖向瓦搭接缝
    for (let col = 0; col <= columns; col += 1) {
      ctx.fillStyle = rgba(62, 70, 70, 0.34);
      ctx.fillRect(col * columnWidth + (random() - 0.5) * 3, y, 1.6, rowHeight);
    }

    // 风化缺角
    for (let chip = 0; chip < 6; chip += 1) {
      const cx = random() * size;
      const r = 3 + random() * 9;
      ctx.fillStyle = rgba(random() > 0.5 ? 176 : 54, random() > 0.5 ? 184 : 62, 176, 0.12 + random() * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx, y + random() * rowHeight, r, r * 0.55, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  softBlotches(ctx, size, random, 40, [48, 56, 56], 0.14);
  softBlotches(ctx, size, random, 18, [186, 196, 188], 0.1);
  speckle(ctx, size, random, size * 5, 0.09);
};

/** 毛石：不规则石块 + 深灰缝 + 石面孔隙。 */
const drawStone = (ctx, size, random) => {
  ctx.fillStyle = '#7d7a75';
  ctx.fillRect(0, 0, size, size);

  const cols = 5;
  const rows = 4;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = (col + 0.5) * cellW + (random() - 0.5) * cellW * 0.18;
      const cy = (row + 0.5) * cellH + (random() - 0.5) * cellH * 0.18;
      const rx = cellW * (0.36 + random() * 0.1);
      const ry = cellH * (0.33 + random() * 0.12);
      const points = 7 + ((random() * 3) | 0);

      ctx.beginPath();

      for (let p = 0; p <= points; p += 1) {
        const angle = (p / points) * Math.PI * 2;
        const jitter = 0.72 + random() * 0.5;
        const px = cx + Math.cos(angle) * rx * jitter;
        const py = cy + Math.sin(angle) * ry * jitter;

        if (p === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.closePath();
      const tone = 132 + random() * 46;
      ctx.fillStyle = rgba(tone, tone - 2, tone - 7, 1);
      ctx.fill();
      ctx.strokeStyle = rgba(70, 68, 64, 0.85);
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
  }

  softBlotches(ctx, size, random, 46, [74, 72, 68], 0.16);
  softBlotches(ctx, size, random, 22, [206, 202, 194], 0.1);
  speckle(ctx, size, random, size * 9, 0.14);
  cracks(ctx, size, random, 14, [86, 84, 80]);
};

/** 竹篱：竹节 + 竹身明暗 + 低饱和灰绿。 */
const drawBamboo = (ctx, size, random) => {
  ctx.fillStyle = '#9a9a74';
  ctx.fillRect(0, 0, size, size);

  const stalks = 9;
  const stalkW = size / stalks;

  for (let i = 0; i < stalks; i += 1) {
    const x = i * stalkW;
    const tone = 158 + random() * 34;
    ctx.fillStyle = rgba(tone, tone + 2, tone - 34, 0.5);
    ctx.fillRect(x + 2, 0, stalkW - 4, size);

    const grad = ctx.createLinearGradient(x, 0, x + stalkW, 0);
    grad.addColorStop(0, rgba(120, 120, 92, 0.3));
    grad.addColorStop(0.4, rgba(224, 224, 186, 0.24));
    grad.addColorStop(1, rgba(104, 104, 78, 0.32));
    ctx.fillStyle = grad;
    ctx.fillRect(x + 2, 0, stalkW - 4, size);

    // 竹节
    const nodes = 3 + ((random() * 3) | 0);

    for (let n = 0; n < nodes; n += 1) {
      const y = (n + 0.5 + (random() - 0.5) * 0.3) * (size / nodes);
      ctx.fillStyle = rgba(96, 96, 70, 0.42);
      ctx.fillRect(x + 2, y, stalkW - 4, 4);
      ctx.fillStyle = rgba(214, 214, 178, 0.2);
      ctx.fillRect(x + 2, y + 4, stalkW - 4, 2);
    }
  }

  speckle(ctx, size, random, size * 4, 0.1);
};

const TEXTURE_RECIPES = {
  earth: { draw: drawEarth, seed: 1101 },
  timber: { draw: drawTimber, seed: 2202 },
  tile: { draw: drawTile, seed: 3303 },
  stone: { draw: drawStone, seed: 4404 },
  bamboo: { draw: drawBamboo, seed: 5505 },
};

// ---------------------------------------------------------------- 贴图集 / 材质库

const toGrayscale = (sourceCanvas, size) => {
  const { canvas, ctx } = createCanvas(size);
  ctx.filter = 'grayscale(1) contrast(1.14)';
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.filter = 'none';
  return canvas;
};

/**
 * 由颜色贴图派生粗糙度图（灰度）。
 *  - 暗部（斑驳/缝隙/风化）→ 高粗糙度；亮部（受光面/木脂/釉面残留）→ 低一档。
 *  - 每角色用 ROLE_ROUGHNESS_BAND 压到各自区间，保证始终落在"哑光"范围内。
 *  - 只用 canvas 2D 像素运算，确定性、无外部依赖、无 shader。
 */
const buildRoughnessCanvas = (sourceCanvas, size, [low, high, gamma]) => {
  const { canvas, ctx } = createCanvas(size);
  ctx.drawImage(sourceCanvas, 0, 0);

  const image = ctx.getImageData(0, 0, size, size);
  const { data } = image;

  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const t = Math.pow(1 - Math.min(1, Math.max(0, lum)), gamma);
    const value = Math.round(255 * (low + (high - low) * t));
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
};

/**
 * 生成共享贴图集：{ earth: { map, bump }, ... }。
 * 同一 size 只生成一次（模块级缓存），多栋宅院共享同一批 GPU 纹理。
 */
let textureSetCache = null;

export const createManorTextureSet = ({ size = MANOR_TEXTURE_SIZE, force = false } = {}) => {
  if (textureSetCache && textureSetCache.size === size && !force) {
    return textureSetCache;
  }

  const presets = MANOR_ROLE_PRESETS;
  const set = {};

  Object.entries(TEXTURE_RECIPES).forEach(([role, recipe]) => {
    const { canvas } = createCanvas(size);
    const ctx = canvas.getContext('2d');
    recipe.draw(ctx, size, mulberry32(recipe.seed));

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(presets[role].repeat[0], presets[role].repeat[1]);
    map.anisotropy = 4;
    map.name = `manor-${role}-map`;

    let bump = map;

    if (!MANOR_SHARE_COLOR_AS_BUMP) {
      bump = new THREE.CanvasTexture(toGrayscale(canvas, Math.max(256, size >> 1)));
      bump.colorSpace = THREE.NoColorSpace; // 数据图，必须线性
      bump.wrapS = THREE.RepeatWrapping;
      bump.wrapT = THREE.RepeatWrapping;
      bump.repeat.copy(map.repeat);
      bump.anisotropy = 2;
      bump.name = `manor-${role}-bump`;
    }

    // roughnessMap：同分辨率派生，与颜色图共用 repeat；线性数据图。
    let roughness = null;

    if (MANOR_ROUGHNESS_MAP && ROLE_ROUGHNESS_BAND[role]) {
      roughness = new THREE.CanvasTexture(
        buildRoughnessCanvas(canvas, size, ROLE_ROUGHNESS_BAND[role]),
      );
      roughness.colorSpace = THREE.NoColorSpace;
      roughness.wrapS = THREE.RepeatWrapping;
      roughness.wrapT = THREE.RepeatWrapping;
      roughness.repeat.copy(map.repeat);
      roughness.anisotropy = 2;
      roughness.name = `manor-${role}-roughness`;
    }

    set[role] = { map, bump, roughness };
  });

  textureSetCache = { size, set };
  return textureSetCache;
};

/**
 * 共享材质库：按 `role:group` 缓存。30+ 栋宅院复用同一批材质。
 * glass / foliage 不在本库接管（保持既有逻辑）。
 */
export const createManorMaterialLibrary = ({ size = MANOR_TEXTURE_SIZE } = {}) => {
  const textureCache = createManorTextureSet({ size });
  const materials = new Map();

  const getMaterial = (role, group) => {
    const preset = MANOR_ROLE_PRESETS[role];

    if (!preset) {
      return null;
    }

    const key = `${role}:${group || 'default'}`;

    if (materials.has(key)) {
      return materials.get(key);
    }

    const tint = (MANOR_GROUP_TINTS[group] || {})[role] || preset.color;
    const textures = textureCache.set[preset.texture || role] || null;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint),
      roughness: preset.roughness,
      metalness: preset.metalness,
      map: textures ? textures.map : null,
      bumpMap: textures ? textures.bump : null,
      bumpScale: textures ? preset.bumpScale : 0,
      // 实际粗糙度 = roughness × roughnessMap（three 的乘法语义），
      // 于是"斑驳处更哑、受光面略平"的层次来自贴图，而不是把整块调到死平。
      roughnessMap: textures ? textures.roughness : null,
      dithering: true,
    });
    material.name = `manor-${key}`;
    materials.set(key, material);
    return material;
  };

  const dispose = () => {
    materials.forEach((material) => material.dispose());
    materials.clear();

    if (textureSetCache) {
      Object.values(textureSetCache.set).forEach(({ map, bump, roughness }) => {
        map.dispose();
        if (bump && bump !== map) {
          bump.dispose();
        }
        if (roughness && roughness !== map) {
          roughness.dispose();
        }
      });
      textureSetCache = null;
    }
  };

  return {
    size: textureCache.size,
    textures: textureCache.set,
    getMaterial,
    dispose,
    get materialCount() {
      return materials.size;
    },
  };
};

// ---------------------------------------------------------------- 角色识别

const GLASS_HEX = '77b9b5';
const GREEN_HEXES = new Set(['4b8a5e', '3f774d', '416f45']);
const ROOF_HEXES = new Set(['62452f', '5e422d', '50382a']);

const luminanceOf = (color) => {
  if (!color) {
    return 160;
  }

  const hex = color.getHexString();
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * 按颜色把网格归到材质角色。
 * 顺序：玻璃 → 植被 → 屋顶（暗棕/在排除表内）→ 按亮度分 夯土 / 原木。
 */
export const resolveManorRole = ({ material }) => {
  if (!material || !material.color) {
    return 'earth';
  }

  if (material.transparent || material.color.getHexString() === GLASS_HEX) {
    return 'glass';
  }

  const hex = material.color.getHexString();

  if (ROLE_COLOR_OVERRIDES[hex]) {
    return ROLE_COLOR_OVERRIDES[hex];
  }

  if (GREEN_HEXES.has(hex)) {
    return 'foliage';
  }

  if (ROOF_HEXES.has(hex)) {
    return 'tile';
  }

  const luminance = luminanceOf(material.color);

  if (luminance < ROLE_LUMINANCE.tile) {
    return 'tile';
  }

  if (luminance > ROLE_LUMINANCE.earth) {
    return 'earth';
  }

  return 'timber';
};
