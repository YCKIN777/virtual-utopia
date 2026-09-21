#!/usr/bin/env node
/**
 * 宅院 GLB 预检工具（部署前 / 部署后都能跑，Node 即可，不需要浏览器）
 *
 * 用途：把「硬性模型约束」变成可执行断言，避免把不合规的模型挂进场景。
 *   node scripts/inspect-manor-glb.mjs                 # 只体检现有 models/*-manor.glb
 *   node scripts/inspect-manor-glb.mjs --baseline      # 与内置基线对比（占地/高度是否跑偏）
 *   node scripts/inspect-manor-glb.mjs --tris 2000 3000
 *
 * 检查项：
 *   1. 三角面总数（含所有 primitive）
 *   2. 世界包围盒（应用节点变换）→ 占地 x/z、高度 y
 *   3. 原点：底面是否贴地(min.y≈0)、水平中心是否在原点(|center.x|,|center.z| 小)
 *   4. 是否含动画 / 蒙皮（应当没有）
 *   5. 是否内嵌贴图（建议不内嵌，用程序化材质）
 *   6. 与基线（改模型前的实测值）对比：占地与高度是否在容差内
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_DIR = path.resolve(
  'frontend/src/virtual-utopia/webgl/models',
);

/** 基线：换模型前的实测值（2026-09-21 实测，脚本自检）。新模型需落在容差内，否则场景布局会跑偏。 */
export const BASELINE = {
  'terrace-manor.glb': { triangles: 312, sizeX: 4.03, sizeZ: 4.19, sizeY: 3.4, minY: -0.0 },
  'forest-manor.glb': { triangles: 264, sizeX: 4.03, sizeZ: 4.19, sizeY: 2.9, minY: -0.0 },
  'cliff-manor.glb': { triangles: 300, sizeX: 4.5, sizeZ: 3.95, sizeY: 5.92, minY: -2.77 },
};

const args = process.argv.slice(2);
const useBaseline = args.includes('--baseline');
const trisIndex = args.indexOf('--tris');
const TRI_MIN = trisIndex >= 0 ? Number(args[trisIndex + 1]) : 0;
const TRI_MAX = trisIndex >= 0 ? Number(args[trisIndex + 2]) : Number.POSITIVE_INFINITY;

// ------------------------------------------------------------------ GLB 解析

const readGlb = (file) => {
  const buffer = readFileSync(file);
  const magic = buffer.toString('utf8', 0, 4);
  if (magic !== 'glTF') {
    throw new Error(`${file} 不是合法 GLB（magic=${magic}）`);
  }

  const total = buffer.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < total) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (chunkType === 0x004e4942) bin = chunk;
    offset += 8 + chunkLength;
  }

  return { json, bin };
};

const COMPONENT = {
  5120: { size: 1, read: (b, o) => b.readInt8(o) },
  5121: { size: 1, read: (b, o) => b.readUInt8(o) },
  5122: { size: 2, read: (b, o) => b.readInt16LE(o) },
  5123: { size: 2, read: (b, o) => b.readUInt16LE(o) },
  5125: { size: 4, read: (b, o) => b.readUInt32LE(o) },
  5126: { size: 4, read: (b, o) => b.readFloatLE(o) },
};

const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const accessorCount = (json, index) => {
  const accessor = json.accessors[index];
  if (!accessor) return 0;
  return accessor.count * (TYPE_COUNT[accessor.type] || 1);
};

const readVec3 = (json, bin, accessorIndex) => {
  const accessor = json.accessors[accessorIndex];
  const component = COMPONENT[accessor.componentType];
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride || component.size * 3;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const offset = base + i * stride;
    out.push([
      component.read(bin, offset),
      component.read(bin, offset + component.size),
      component.read(bin, offset + component.size * 2),
    ]);
  }
  return out;
};

// ------------------------------------------------------------------ 矩阵

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiply = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
};

const fromTrs = ({ translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1] }) => {
  const [x, y, z, w] = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = scale;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    translation[0], translation[1], translation[2], 1,
  ];
};

const nodeMatrix = (node) => (node.matrix ? node.matrix : fromTrs(node));

const transformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// ------------------------------------------------------------------ 体检

export const inspectGlb = (file) => {
  const { json, bin } = readGlb(file);
  const bbox = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  let triangles = 0;
  const materials = new Set();

  const walk = (nodeIndex, parentMatrix) => {
    const node = json.nodes[nodeIndex];
    if (!node) return;
    const world = multiply(parentMatrix, nodeMatrix(node));

    if (node.mesh != null) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        materials.add(primitive.material);
        const indexCount =
          primitive.indices != null ? accessorCount(json, primitive.indices) : 0;
        const positionCount = accessorCount(json, primitive.attributes.POSITION);
        triangles += Math.round((indexCount || positionCount) / 3);

        const points = readVec3(json, bin, primitive.attributes.POSITION);
        for (const point of points) {
          const p = transformPoint(world, point);
          for (let axis = 0; axis < 3; axis += 1) {
            bbox.min[axis] = Math.min(bbox.min[axis], p[axis]);
            bbox.max[axis] = Math.max(bbox.max[axis], p[axis]);
          }
        }
      }
    }

    for (const child of node.children || []) walk(child, world);
  };

  const scene = json.scenes?.[json.scene ?? 0];
  for (const rootIndex of scene?.nodes || []) walk(rootIndex, identity());

  const sizeX = bbox.max[0] - bbox.min[0];
  const sizeY = bbox.max[1] - bbox.min[1];
  const sizeZ = bbox.max[2] - bbox.min[2];
  const centerX = (bbox.max[0] + bbox.min[0]) / 2;
  const centerZ = (bbox.max[2] + bbox.min[2]) / 2;

  return {
    file: path.basename(file),
    triangles,
    materials: materials.size,
    sizeX,
    sizeY,
    sizeZ,
    minY: bbox.min[1],
    centerX,
    centerZ,
    animations: (json.animations || []).length,
    skins: (json.skins || []).length,
    images: (json.images || []).length,
  };
};

// ------------------------------------------------------------------ 主流程

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!isMain) {
  // 被 import（例如 verify-manor-deploy.mjs）时只导出工具函数，不执行体检。
} else {

const files = readdirSync(MODELS_DIR)
  .filter((name) => name.endsWith('-manor.glb'))
  .sort();

if (files.length === 0) {
  console.error(`未在 ${MODELS_DIR} 找到 *-manor.glb`);
  process.exit(1);
}

const results = [];
let failed = 0;

const check = (label, ok, extra = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`);
};

for (const name of files) {
  const info = inspectGlb(path.join(MODELS_DIR, name));
  results.push(info);

  console.log(`\n== ${info.file}`);
  console.log(
    `   三角面 ${info.triangles} · 材质 ${info.materials} · 占地 ${info.sizeX.toFixed(2)}×${info.sizeZ.toFixed(2)} · 高 ${info.sizeY.toFixed(2)} · minY ${info.minY.toFixed(3)} · 水平中心 (${info.centerX.toFixed(2)}, ${info.centerZ.toFixed(2)}) · 动画 ${info.animations} · 蒙皮 ${info.skins} · 内嵌贴图 ${info.images}`,
  );

  if (TRI_MAX !== Number.POSITIVE_INFINITY || TRI_MIN > 0) {
    check(
      `  三角面在 [${TRI_MIN}, ${TRI_MAX}] 内`,
      info.triangles >= TRI_MIN && info.triangles <= TRI_MAX,
      String(info.triangles),
    );
  }

  check('  无动画', info.animations === 0);
  check('  无蒙皮骨骼', info.skins === 0);
  // 原点：不得「悬在原点之上」（否则挂到地块会飘）；向下延伸（如崖居底座）是允许的。
  check(
    '  未悬空（min.y ≤ +0.08，即模型不整体高于原点）',
    info.minY <= 0.08,
    `min.y=${info.minY.toFixed(3)}`,
  );
  if (info.minY < -0.5) {
    console.log(
      `   注意：模型向下延伸 ${(-info.minY).toFixed(2)}m（崖居底座/支撑属正常，但要人工确认不会被地形吞没）`,
    );
  }
  check(
    '  水平中心在原点（|cx|,|cz| ≤ 0.6m）',
    Math.abs(info.centerX) <= 0.6 && Math.abs(info.centerZ) <= 0.6,
    `(${info.centerX.toFixed(2)}, ${info.centerZ.toFixed(2)})`,
  );

  if (useBaseline) {
    const base = BASELINE[info.file];
    if (!base) {
      console.log(`   （无基线，跳过对比）`);
    } else {
      const ratio = (a, b) => (b === 0 ? 0 : Math.abs(a - b) / b);
      check(
        `  占地与基线一致(±15%)`,
        ratio(info.sizeX, base.sizeX) <= 0.15 && ratio(info.sizeZ, base.sizeZ) <= 0.15,
        `x ${base.sizeX}→${info.sizeX.toFixed(2)} / z ${base.sizeZ}→${info.sizeZ.toFixed(2)}`,
      );
      check(
        `  高度与基线一致(±12%)`,
        ratio(info.sizeY, base.sizeY) <= 0.12,
        `${base.sizeY}→${info.sizeY.toFixed(2)}`,
      );
    }
  }
}

console.log(
  `\n=== 预检汇总: ${failed === 0 ? '全部通过' : failed + ' 项不通过'}（共 ${results.length} 个模型） ===`,
);
if (useBaseline) {
  console.log('基线（换模型前的实测值）：');
  Object.entries(BASELINE).forEach(([name, b]) =>
    console.log(
      `  ${name}: 面 ${b.triangles} · 占地 ${b.sizeX}×${b.sizeZ} · 高 ${b.sizeY}`,
    ),
  );
}
process.exit(failed ? 1 : 0);

}
