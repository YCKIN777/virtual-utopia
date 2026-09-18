const HOME_COUNT = 50;

export const getTerrainHeight = (x, z) => {
  const distance = Math.hypot(x, z);
  const plateau = distance < 16 ? (16 - distance) * 0.18 : 0;
  const streamDistance = Math.abs(x - Math.sin(z * 0.075) * 9);
  const valley =
    streamDistance < 7.2 ? -4.6 * Math.pow(1 - streamDistance / 7.2, 0.72) : 0;
  const microRelief =
    Math.sin(x * 0.33) * Math.cos(z * 0.27) * 0.18 +
    Math.sin(x * 0.11 + z * 0.17) * 0.14;
  return (
    Math.sin(x * 0.065) * 2.2 +
    Math.cos(z * 0.058) * 1.8 +
    Math.sin((x + z) * 0.031) * 2.6 +
    Math.cos(distance * 0.055) * 1.2 +
    plateau +
    valley +
    microRelief
  );
};

const getStreamX = (z) => Math.sin(z * 0.075) * 9;

const groupDefinitions = [
  {
    id: 'terrace',
    label: '台地组团',
    count: 13,
    view: 'plaza',
    minDistance: 15,
  },
  {
    id: 'stream',
    label: '临溪组团',
    count: 12,
    view: 'stream',
    minDistance: 15,
  },
  {
    id: 'forest',
    label: '森林组团',
    count: 13,
    view: 'forest',
    minDistance: 15,
  },
  {
    id: 'cliff',
    label: '悬崖组团',
    count: 12,
    view: 'cliff',
    minDistance: 15,
  },
];

const createRandom = (seed = 86173) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const createCandidate = (group, random, number) => {
  if (group.id === 'stream') {
    const side = number % 2 === 0 ? -1 : 1;
    const pairIndex = Math.floor(number / 2);
    const z = -75 + pairIndex * 29 + side * 6 + (random() - 0.5) * 2.4;
    const offset = 7.2 + random() * 3.8;
    const x = getStreamX(z) + side * offset;
    return {
      x,
      z,
      angle: Math.atan2(-side, 0),
    };
  }

  if (group.id === 'forest') {
    const angle = Math.PI * (0.62 + random() * 0.78);
    const radius = 34 + random() * 32;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle: angle + Math.PI,
    };
  }

  if (group.id === 'cliff') {
    const column = number % 4;
    const row = Math.floor(number / 4);
    return {
      x: 38 + column * 16.5 + (random() - 0.5) * 4,
      z: -48 + row * 24 + (random() - 0.5) * 5,
      angle: -Math.PI / 2,
    };
  }

  const column = number % 4;
  const row = Math.floor(number / 4) % 4;
  return {
    x: 11 + column * 17 + (random() - 0.5) * 3,
    z: -34 + row * 17 + (random() - 0.5) * 3,
    angle: Math.PI,
  };
};

const isValidCandidate = (candidate, group, existing) => {
  const distanceToStream = Math.abs(candidate.x - getStreamX(candidate.z));

  if (
    group.id === 'stream' &&
    (distanceToStream < 5.6 || distanceToStream > 12.5)
  ) {
    return false;
  }

  if (group.id === 'terrace' && distanceToStream < 8) {
    return false;
  }

  if (!['stream', 'terrace'].includes(group.id) && distanceToStream < 13) {
    return false;
  }

  return existing.every((home) => {
    const distance = Math.hypot(home.x - candidate.x, home.z - candidate.z);

    if (home.group === group.id) {
      return distance >= group.minDistance;
    }

    return distance >= 4;
  });
};

const createHomes = () => {
  const random = createRandom();
  const homes = [];
  let number = 1;

  groupDefinitions.forEach((group) => {
    let placed = 0;
    let attempts = 0;

    while (placed < group.count && attempts < 6000) {
      attempts += 1;
      const candidate = createCandidate(group, random, attempts);

      if (!isValidCandidate(candidate, group, homes)) {
        continue;
      }

      const variantByGroup = {
        cliff: 0,
        forest: 1,
        terrace: 2,
        stream: 3,
      };
      homes.push({
        id: `plot-${number}`,
        number,
        group: group.id,
        groupLabel: group.label,
        x: candidate.x,
        z: candidate.z,
        y: getTerrainHeight(candidate.x, candidate.z),
        scale: 0.92 + (number % 5) * 0.045 + (group.id === 'cliff' ? 0.08 : 0),
        variant: variantByGroup[group.id],
        view: group.view,
        rotation: candidate.angle,
        isUserHome: number === 1,
      });
      placed += 1;
      number += 1;
    }

    if (placed < group.count) {
      throw new Error(
        `Unable to place ${group.label}: ${placed}/${group.count}`,
      );
    }
  });

  return homes;
};

export const homes = createHomes();

const groupCenters = {
  stream: { x: getStreamX(0) + 9, z: 0 },
  forest: { x: -36, z: 42 },
  cliff: { x: 55, z: -10 },
  terrace: { x: 22, z: -17 },
};

export const bridgeNetwork = groupDefinitions.map((group) => ({
  id: `group-${group.id}`,
  group: group.id,
  hub: {
    x: groupCenters[group.id].x,
    y: getTerrainHeight(groupCenters[group.id].x, groupCenters[group.id].z),
    z: groupCenters[group.id].z,
  },
}));

export const crossGroupBridges = [
  {
    id: 'stream-bridge-north',
    from: { x: 17, z: -48 },
    to: { x: -18, z: -48 },
  },
  {
    id: 'stream-bridge-center',
    from: { x: 15, z: 2 },
    to: { x: -16, z: 8 },
  },
  {
    id: 'stream-bridge-south',
    from: { x: 14, z: 54 },
    to: { x: -17, z: 58 },
  },
];

export const getHomeById = (id) => homes.find((home) => home.id === id) || null;

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
  let minimumDistance = Number.POSITIVE_INFINITY;
  let minimumCrossGroupDistance = Number.POSITIVE_INFINITY;

  homes.forEach((home, index) => {
    homes.slice(index + 1).forEach((other) => {
      const distance = Math.hypot(home.x - other.x, home.z - other.z);
      if (home.group === other.group) {
        minimumDistance = Math.min(minimumDistance, distance);

        if (distance < 15) {
          overlapping.push([home.id, other.id]);
        }
      } else {
        minimumCrossGroupDistance = Math.min(
          minimumCrossGroupDistance,
          distance,
        );
      }
    });
  });

  const groupCounts = homes.reduce((counts, home) => {
    counts[home.group] = (counts[home.group] || 0) + 1;
    return counts;
  }, {});

  return {
    valid: overlapping.length === 0,
    overlapping,
    minimumDistance,
    minimumCrossGroupDistance,
    groupCounts,
  };
};
