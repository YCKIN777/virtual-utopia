const HOME_COUNT = 50;

// 阶段四：地形统一为水平面（消除台地/崖边/溪谷的高低起伏）。
// 角色行走与所有贴地物件均落在同一平面 y=0，彻底解决人物下沉/卡入地下问题。
// 「浅溪流」改由水面色带 + 浅水几何呈现，不再依赖地形起伏。
export const getTerrainHeight = () => 0;

const getStreamX = (z) => Math.sin(z * 0.075) * 9;

const getStreamWidth = (z) =>
  1.45 +
  (0.5 + 0.5 * Math.sin(z * 0.087)) * 1.2 +
  (0.5 + 0.5 * Math.sin(z * 0.021 + 1.7)) * 0.85;

// ============================================================================
// 阶段八：50 栋宅院按「依山散落的山居聚落」三区重排
//   ① 广场近区 · 台地宅院  12 栋
//   ② 河道沿岸区 · 临溪宅院 18 栋
//   ③ 山边缓坡区 · 崖边宅院 20 栋（= 崖边模型 12 + 森林模型 8，两种既有山居
//      外观混排，4 种宅院模型资产全部保留使用）
// 仅调整坐标 + 类型归属：宅院模型 / 内部功能 / 派生碰撞盒逻辑一概不改。
// ============================================================================
const ZONE_DEFS = [
  {
    id: 'terrace',
    label: '台地宅院',
    zone: 'plaza',
    count: 12,
    minSpacing: 10,
    view: 'plaza',
    variant: 2,
  },
  {
    id: 'stream',
    label: '临溪宅院',
    zone: 'stream',
    count: 18,
    minSpacing: 8,
    view: 'stream',
    variant: 3,
  },
  {
    id: 'forest',
    label: '崖边宅院',
    zone: 'mountain',
    count: 8,
    minSpacing: 12,
    view: 'forest',
    variant: 1,
  },
  {
    id: 'cliff',
    label: '崖边宅院',
    zone: 'mountain',
    count: 12,
    minSpacing: 12,
    view: 'cliff',
    variant: 0,
  },
];

// —— 规划约束（全部为米）——
const PLAZA_CLEAR_RADIUS = 34; // 广场 + 环形林间留白（保证中心木构穹顶地标的主视线通廊）
const PLAZA_RADIUS_MIN = 36; // 台地宅院环带内半径
const PLAZA_RADIUS_MAX = 58; // 台地宅院环带外半径
const RIVER_CLEAR_TERRACE = 9; // 台地宅院距主河道中线最小距离
const STREAM_BANK_MIN = 6.8; // 临溪宅院距河道中线最小（≈退水岸 2.6m）
const STREAM_BANK_MAX = 17; // 临溪宅院距河道中线最大（仍在岸线内）
const STREAM_Z_MIN = 34; // 沿河起止（避开广场跨河平台段）
const STREAM_Z_MAX = 94;
const MOUNTAIN_MIN_RADIUS = 66; // 山边缓坡区内半径
const MOUNTAIN_MAX_RADIUS = 132; // 山边缓坡区外半径（山脚缓冲带 70~148 之内）
const MOUNTAIN_RIVER_CLEAR = 14; // 山边宅院距主河道中线
const WORLD_LIMIT = 140; // 不越过山脚缓冲带外沿

// 次级溪流（thin rivulets）：河道清理后仍保留的两条溪线，宅院需避让。
const SECONDARY_STREAM_X = [
  (z) => -72 + Math.sin(z * 0.04) * 9,
  (z) => 76 + Math.cos(z * 0.035) * 8,
];

const createRandom = (seed = 20260922) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const distanceToMainStream = (x, z) => Math.abs(x - getStreamX(z));

const nearSecondaryStream = (x, z, margin) =>
  SECONDARY_STREAM_X.some((fn) => Math.abs(x - fn(z)) < margin);

const zoneOf = (groupId) =>
  ZONE_DEFS.find((def) => def.id === groupId)?.zone || 'other';

const minSpacingOf = (groupId) =>
  ZONE_DEFS.find((def) => def.id === groupId)?.minSpacing || 8;

const randomPointInZone = (def, random) => {
  if (def.zone === 'plaza') {
    const angle = random() * Math.PI * 2;
    const radius = PLAZA_RADIUS_MIN + random() * (PLAZA_RADIUS_MAX - PLAZA_RADIUS_MIN);
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle: angle + Math.PI,
    };
  }

  if (def.zone === 'stream') {
    const side = random() < 0.5 ? -1 : 1;
    const direction = random() < 0.5 ? -1 : 1;
    const z =
      direction * (STREAM_Z_MIN + random() * (STREAM_Z_MAX - STREAM_Z_MIN));
    const offset = STREAM_BANK_MIN + random() * (STREAM_BANK_MAX - STREAM_BANK_MIN);
    return {
      x: getStreamX(z) + side * offset,
      z,
      angle: Math.atan2(-side, 0),
    };
  }

  // 山边缓坡区：沿山脚环形散落
  const angle = random() * Math.PI * 2;
  const radius =
    MOUNTAIN_MIN_RADIUS +
    Math.pow(random(), 0.8) * (MOUNTAIN_MAX_RADIUS - MOUNTAIN_MIN_RADIUS);
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    angle: angle + Math.PI,
  };
};

const isValidCandidate = (candidate, def, existing) => {
  const { x, z } = candidate;
  const distanceToCenter = Math.hypot(x, z);

  // 地形范围内 + 不占用广场核心区（保地标视线通廊）
  if (distanceToCenter > WORLD_LIMIT) return false;
  if (distanceToCenter < PLAZA_CLEAR_RADIUS) return false;

  const streamDistance = distanceToMainStream(x, z);
  const streamHalfWidth = getStreamWidth(z); // 水面半宽（含波动）

  if (def.zone === 'plaza' && streamDistance < RIVER_CLEAR_TERRACE) return false;
  if (
    def.zone === 'stream' &&
    (streamDistance < streamHalfWidth + 2.2 || // 退水岸 ≥ 2m
      streamDistance > STREAM_BANK_MAX + 1.5)
  ) {
    return false;
  }
  if (def.zone === 'mountain' && streamDistance < MOUNTAIN_RIVER_CLEAR) {
    return false;
  }

  // 避让次级溪流
  if (nearSecondaryStream(x, z, def.zone === 'mountain' ? 6 : 4.5)) return false;

  const zone = def.zone;

  return existing.every((home) => {
    const spacing = Math.hypot(home.x - x, home.z - z);
    if (zoneOf(home.group) === zone) {
      return spacing >= Math.max(def.minSpacing, minSpacingOf(home.group));
    }
    return spacing >= 8;
  });
};

const createHomes = () => {
  const random = createRandom();
  const homes = [];
  let number = 1;

  ZONE_DEFS.forEach((def) => {
    let placed = 0;
    let attempts = 0;

    while (placed < def.count && attempts < 40000) {
      attempts += 1;
      const candidate = randomPointInZone(def, random);

      if (!isValidCandidate(candidate, def, homes)) {
        continue;
      }

      homes.push({
        id: `plot-${number}`,
        number,
        group: def.id,
        groupLabel: def.label,
        zone: def.zone,
        x: candidate.x,
        z: candidate.z,
        y: getTerrainHeight(candidate.x, candidate.z),
        scale:
          0.92 + (number % 5) * 0.045 + (def.zone === 'mountain' ? 0.08 : 0),
        variant: def.variant,
        view: def.view,
        rotation: candidate.angle,
        isUserHome: number === 1,
      });

      placed += 1;
      number += 1;
    }

    if (placed < def.count) {
      throw new Error(
        `无法完成宅院排布：${def.label}(${def.id}) ${placed}/${def.count}`,
      );
    }
  });

  if (homes.length !== HOME_COUNT) {
    throw new Error(`宅院总数异常：${homes.length}/${HOME_COUNT}`);
  }

  return homes;
};

export const homes = createHomes();

// 组团枢纽（用于房门朝向、入户石板/花架落点、镜头飞入与植被避让）
const groupCenters = {
  terrace: { x: 0, z: 0 }, // 台地宅院朝向广场
  stream: { x: getStreamX(0), z: 0 }, // 临溪宅院朝向河道
  forest: { x: -78, z: -78 },
  cliff: { x: 92, z: 0 },
};

export const bridgeNetwork = ZONE_DEFS.map((def) => ({
  id: `group-${def.id}`,
  group: def.id,
  hub: {
    x: groupCenters[def.id].x,
    y: getTerrainHeight(groupCenters[def.id].x, groupCenters[def.id].z),
    z: groupCenters[def.id].z,
  },
}));

export const crossGroupBridges = [
  {
    id: 'stream-bridge-north',
    from: { x: 18, z: -46 },
    to: { x: -18, z: -46 },
  },
  {
    id: 'stream-bridge-center',
    from: { x: 15, z: 2 },
    to: { x: -16, z: 8 },
  },
  {
    id: 'stream-bridge-south',
    from: { x: 16, z: 52 },
    to: { x: -17, z: 56 },
  },
];

export const getHomeById = (id) => homes.find((home) => home.id === id) || null;

// 属地聊天：判定玩家当前所在的聊天频道。
// 距离宅院中心 HOME_CHANNEL_RADIUS 内 => 该宅院门口频道（plot-N）；否则 => 广场频道（plaza）。
const HOME_CHANNEL_RADIUS = 4.5;

export const getChannelForPosition = (x, z) => {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const home of homes) {
    const distance = Math.hypot(x - home.x, z - home.z);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = home;
    }
  }

  if (nearest && nearestDistance <= HOME_CHANNEL_RADIUS) {
    return `plot-${nearest.number}`;
  }

  return 'plaza';
};

export const getChannelLabel = (channel) => {
  if (!channel || channel === 'plaza') {
    return '广场频道';
  }

  const match = /^plot-(\d+)$/.exec(channel);

  return match ? `${match[1]}号宅院门口` : channel;
};

export const getNearestHub = (home) => {
  const preferred = bridgeNetwork.find((bridge) => bridge.group === home.group);

  if (preferred) {
    return {
      ...preferred.hub,
      distance: Math.hypot(home.x - preferred.hub.x, home.z - preferred.hub.z),
    };
  }

  return bridgeNetwork
    .map((bridge) => ({
      ...bridge.hub,
      distance: Math.hypot(home.x - bridge.hub.x, home.z - bridge.hub.z),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
};

export const validateHomeLayout = () => {
  const overlapping = [];
  const riverViolations = [];
  const plazaViolations = [];
  const outOfBounds = [];
  let minimumDistance = Number.POSITIVE_INFINITY;
  let minimumCrossGroupDistance = Number.POSITIVE_INFINITY;

  homes.forEach((home) => {
    const distanceToCenter = Math.hypot(home.x, home.z);

    if (!Number.isFinite(home.x) || !Number.isFinite(home.z)) {
      outOfBounds.push(home.id);
    }
    if (distanceToCenter > WORLD_LIMIT) outOfBounds.push(home.id);
    if (distanceToMainStream(home.x, home.z) < 4.5) riverViolations.push(home.id);
    if (distanceToCenter < PLAZA_CLEAR_RADIUS) plazaViolations.push(home.id);
  });

  homes.forEach((home, index) => {
    homes.slice(index + 1).forEach((other) => {
      const distance = Math.hypot(home.x - other.x, home.z - other.z);
      const sameZone = zoneOf(home.group) === zoneOf(other.group);

      if (sameZone) {
        minimumDistance = Math.min(minimumDistance, distance);
        const required = Math.max(
          minSpacingOf(home.group),
          minSpacingOf(other.group),
        );
        if (distance < required) overlapping.push([home.id, other.id]);
      } else {
        minimumCrossGroupDistance = Math.min(
          minimumCrossGroupDistance,
          distance,
        );
        if (distance < 8 - 1e-6) overlapping.push([home.id, other.id]);
      }
    });
  });

  const groupCounts = homes.reduce((counts, home) => {
    counts[home.group] = (counts[home.group] || 0) + 1;
    return counts;
  }, {});

  const zoneCounts = homes.reduce((counts, home) => {
    counts[home.zone] = (counts[home.zone] || 0) + 1;
    return counts;
  }, {});

  return {
    valid:
      overlapping.length === 0 &&
      riverViolations.length === 0 &&
      plazaViolations.length === 0 &&
      outOfBounds.length === 0,
    homeCount: homes.length,
    overlapping,
    riverViolations,
    plazaViolations,
    outOfBounds,
    minimumDistance,
    minimumCrossGroupDistance,
    groupCounts,
    zoneCounts,
  };
};
