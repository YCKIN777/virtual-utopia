export const TILE_WIDTH = 58;
export const TILE_HEIGHT = 29;

export const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

export const worldToScreen = ({ x, y, camera, viewport }) => ({
  x:
    viewport.width / 2 + camera.panX + (x - y) * (TILE_WIDTH / 2) * camera.zoom,
  y:
    viewport.height * 0.055 +
    camera.panY +
    (x + y) * (TILE_HEIGHT / 2) * camera.zoom,
});

export const screenToWorld = ({ x, y, camera, viewport }) => {
  const horizontal =
    (x - viewport.width / 2 - camera.panX) / (camera.zoom * (TILE_WIDTH / 2));
  const vertical =
    (y - viewport.height * 0.055 - camera.panY) /
    (camera.zoom * (TILE_HEIGHT / 2));

  return {
    x: vertical + horizontal,
    y: vertical - horizontal,
  };
};

export const createIsoDiamond = ({
  x,
  y,
  halfWidth,
  halfHeight,
  camera,
  viewport,
}) => {
  const points = [
    { x: x - halfWidth, y },
    { x, y: y - halfHeight },
    { x: x + halfWidth, y },
    { x, y: y + halfHeight },
  ];

  return points.map((point) =>
    worldToScreen({
      ...point,
      camera,
      viewport,
    }),
  );
};

export const pointInPolygon = (point, polygon) => {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

export const drawPolygon = (
  context,
  points,
  fillStyle,
  strokeStyle,
  lineWidth = 1,
) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }

  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();

  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
  }
};

export const drawDiamond = (context, center, width, height) => {
  context.beginPath();
  context.moveTo(center.x, center.y - height / 2);
  context.lineTo(center.x + width / 2, center.y);
  context.lineTo(center.x, center.y + height / 2);
  context.lineTo(center.x - width / 2, center.y);
  context.closePath();
};

const HOME_LAYOUT_SEED = 20260916;
const HOME_COUNT = 50;
const HOME_CLEARANCE_X = 0.5;
const HOME_CLEARANCE_Y = 0.4;

const residentialAreaPolygon = [
  { x: -4.2, y: -0.4 },
  { x: 16.8, y: -0.4 },
  { x: 20.8, y: 7.8 },
  { x: 16.4, y: 19.2 },
  { x: -3.8, y: 19.3 },
  { x: -7.6, y: 7.9 },
];

const centralPlazaPolygon = [
  { x: 6.1, y: 8.5 },
  { x: 9.4, y: 8.2 },
  { x: 11.4, y: 9.6 },
  { x: 11.2, y: 12.2 },
  { x: 9.4, y: 13.5 },
  { x: 6.6, y: 13.3 },
  { x: 5.2, y: 11.7 },
];

const trainingGroundFootprint = {
  x: 13.5,
  y: 13.4,
  halfWidth: 1.72,
  halfHeight: 1.28,
};

const roadPaths = [
  {
    points: [
      { x: 6.8, y: 1.2 },
      { x: 7.2, y: 3.4 },
      { x: 7.8, y: 5.4 },
      { x: 8.1, y: 8.1 },
      { x: 8.4, y: 10.6 },
      { x: 8.2, y: 12.9 },
      { x: 7.4, y: 15.2 },
    ],
    clearance: 1.02,
  },
  {
    points: [
      { x: -2.6, y: 7.3 },
      { x: 1.2, y: 7.7 },
      { x: 4.4, y: 8.6 },
      { x: 8.4, y: 10.6 },
      { x: 11.8, y: 10.1 },
      { x: 15.8, y: 8.2 },
      { x: 17, y: 7.3 },
    ],
    clearance: 0.92,
  },
  ...[
    [
      { x: 2.1, y: 5.2 },
      { x: 5.1, y: 6.1 },
      { x: 8.1, y: 8.1 },
      { x: 11.6, y: 6.8 },
      { x: 14.8, y: 5.2 },
    ],
    [
      { x: 1.4, y: 10.2 },
      { x: 4.8, y: 9.6 },
      { x: 8.4, y: 10.6 },
      { x: 11.6, y: 12.3 },
      { x: 14.7, y: 12.5 },
    ],
    [
      { x: 3.4, y: 13.8 },
      { x: 6.2, y: 12.4 },
      { x: 8.4, y: 10.6 },
      { x: 10.7, y: 13.8 },
      { x: 13.6, y: 15.2 },
    ],
    [
      { x: 1.2, y: 15.2 },
      { x: 4.8, y: 14.8 },
      { x: 7.4, y: 15.2 },
      { x: 10.8, y: 15.6 },
      { x: 14, y: 14.6 },
    ],
  ].map((points) => ({
    points,
    clearance: 0.7,
  })),
];

const fixedObstacles = [
  { x: 7.2, y: 7.7, radius: 1.08 },
  { x: 10.4, y: 8.1, radius: 1.08 },
  { x: 8.3, y: 9.8, radius: 1.08 },
  { x: 5.2, y: 9.4, radius: 1.08 },
  { x: 11.8, y: 11, radius: 1.05 },
  { x: 3.2, y: 12.9, radius: 1.05 },
  { x: 6.9, y: 1.1, radius: 1.12 },
  { x: -0.8, y: 1.3, radius: 1.05 },
  { x: 14.5, y: 15.4, radius: 1.05 },
  { x: 16.4, y: 8.3, radius: 1.05 },
  { x: 15.3, y: 5.2, radius: 1.08 },
  { x: 5.2, y: 16.3, radius: 1.05 },
];

const mulberry32 = (seed) => {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const pointInPolygon2d = (point, polygon) => {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const distanceToSegment = (point, start, end) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
        lengthSquared,
    ),
  );
  const closestX = start.x + progress * deltaX;
  const closestY = start.y + progress * deltaY;

  return Math.hypot(point.x - closestX, point.y - closestY);
};

const distanceToPath = (point, path) => {
  let minimum = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(point, path[index], path[index + 1]),
    );
  }

  return minimum;
};

const getNearestRoad = (point) => {
  let nearest = null;

  for (const road of roadPaths) {
    for (const roadPoint of road.points) {
      const distance = Math.hypot(roadPoint.x - point.x, roadPoint.y - point.y);

      if (!nearest || distance < nearest.distance) {
        nearest = {
          ...roadPoint,
          distance,
          clearance: road.clearance,
        };
      }
    }
  }

  return nearest;
};

const getRoadClearanceViolation = (point) =>
  roadPaths.some((road) => distanceToPath(point, road.points) < road.clearance);

const getObstacleViolation = (point) =>
  fixedObstacles.some(
    (obstacle) =>
      Math.hypot(point.x - obstacle.x, point.y - obstacle.y) < obstacle.radius,
  );

const getPlazaViolation = (point) => {
  if (pointInPolygon2d(point, centralPlazaPolygon)) {
    return true;
  }

  for (let index = 0; index < centralPlazaPolygon.length; index += 1) {
    if (
      distanceToSegment(
        point,
        centralPlazaPolygon[index],
        centralPlazaPolygon[(index + 1) % centralPlazaPolygon.length],
      ) < 0.62
    ) {
      return true;
    }
  }

  return false;
};

const getTrainingViolation = (point) =>
  Math.abs(point.x - trainingGroundFootprint.x) <
    trainingGroundFootprint.halfWidth + 0.42 &&
  Math.abs(point.y - trainingGroundFootprint.y) <
    trainingGroundFootprint.halfHeight + 0.38;

const createHomeFootprint = ({ number, x, y, random }) => {
  const nearestRoad = getNearestRoad({ x, y });
  const angle = Math.atan2(nearestRoad.y - y, nearestRoad.x - x);
  const orientation = (Math.round(angle / (Math.PI / 2)) + 4) % 4;

  return {
    number,
    x,
    y,
    halfWidth: 0.42 + random() * 0.065,
    halfHeight: 0.31 + random() * 0.04,
    orientation,
  };
};

const hasFootprintCollision = (candidate, existing) =>
  existing.some(
    (home) =>
      Math.abs(candidate.x - home.x) <
        candidate.halfWidth + home.halfWidth + HOME_CLEARANCE_X &&
      Math.abs(candidate.y - home.y) <
        candidate.halfHeight + home.halfHeight + HOME_CLEARANCE_Y,
  );

const isValidHome = (candidate, existing) =>
  pointInPolygon2d(candidate, residentialAreaPolygon) &&
  !getPlazaViolation(candidate) &&
  !getTrainingViolation(candidate) &&
  !getRoadClearanceViolation(candidate) &&
  !getObstacleViolation(candidate) &&
  !hasFootprintCollision(candidate, existing);

export const validateHomeLayout = (homes) => {
  const overlapping = [];
  const outOfBounds = [];
  const invalidOrientation = [];

  homes.forEach((home, index) => {
    if (
      !pointInPolygon2d(home, residentialAreaPolygon) ||
      getPlazaViolation(home) ||
      getTrainingViolation(home) ||
      getRoadClearanceViolation(home) ||
      getObstacleViolation(home)
    ) {
      outOfBounds.push(home.number);
    }

    if (
      !Number.isInteger(home.orientation) ||
      home.orientation < 0 ||
      home.orientation > 3
    ) {
      invalidOrientation.push(home.number);
    }

    for (
      let otherIndex = index + 1;
      otherIndex < homes.length;
      otherIndex += 1
    ) {
      if (hasFootprintCollision(home, [homes[otherIndex]])) {
        overlapping.push([home.number, homes[otherIndex].number]);
      }
    }
  });

  return {
    valid:
      overlapping.length === 0 &&
      outOfBounds.length === 0 &&
      invalidOrientation.length === 0,
    overlapping,
    outOfBounds,
    invalidOrientation,
  };
};

export const createHomeLayout = ({
  count = HOME_COUNT,
  seed = HOME_LAYOUT_SEED,
} = {}) => {
  const random = mulberry32(seed);
  const homes = [];
  const ringPlans = [
    { count: 12, radius: 5.2, offset: 0.34 },
    { count: 12, radius: 6.1, offset: 0.62 },
    { count: 12, radius: 7, offset: 0.08 },
    { count: 12, radius: 7.9, offset: 0.45 },
    { count: 12, radius: 8.8, offset: 0.74 },
    { count: 12, radius: 9.7, offset: 0.18 },
    { count: 12, radius: 10.6, offset: 0.52 },
    { count: 12, radius: 11.5, offset: 0.86 },
    { count: 12, radius: 12.35, offset: 0.28 },
    { count: 12, radius: 13.1, offset: 0.66 },
  ];
  const radiusNudges = [0, 0.28, -0.28, 0.48, -0.48];
  const angleNudges = [0, 0.035, -0.035, 0.065, -0.065];
  let attempts = 0;

  for (const ring of ringPlans) {
    if (homes.length >= count) {
      break;
    }

    for (let index = 0; index < ring.count; index += 1) {
      if (homes.length >= count) {
        break;
      }

      const baseAngle = ring.offset + (Math.PI * 2 * index) / ring.count;
      let placed = false;

      for (const radiusNudge of radiusNudges) {
        for (const angleNudge of angleNudges) {
          if (placed) {
            break;
          }

          attempts += 1;
          const angle = baseAngle + angleNudge;
          const radius = ring.radius + radiusNudge;
          const position = {
            x: 8.4 + Math.cos(angle) * radius * 1.18,
            y: 10.6 + Math.sin(angle) * radius * 0.76,
          };
          const candidate = createHomeFootprint({
            number: homes.length + 1,
            ...position,
            random,
          });

          if (isValidHome(candidate, homes)) {
            homes.push(candidate);
            placed = true;
          }
        }
      }
    }
  }

  if (homes.length < count) {
    for (let index = 0; homes.length < count; index += 1) {
      attempts += 1;
      const row = index % 5;
      const column = Math.floor(index / 5) % 10;
      const position = {
        x: 1.1 + column * 1.58 + (row % 2) * 0.24,
        y: 2.3 + row * 3.05 + (column % 3) * 0.16,
      };
      const candidate = createHomeFootprint({
        number: homes.length + 1,
        ...position,
        random,
      });

      if (isValidHome(candidate, homes)) {
        homes.push(candidate);
      }

      if (index > 600) {
        break;
      }
    }
  }

  if (homes.length < count) {
    throw new Error(
      `unable to place ${count} home plots without collisions; placed ${homes.length}`,
    );
  }

  const validation = validateHomeLayout(homes);

  if (!validation.valid) {
    throw new Error('generated home layout failed validation');
  }

  return {
    homes,
    validation,
    attempts,
  };
};
