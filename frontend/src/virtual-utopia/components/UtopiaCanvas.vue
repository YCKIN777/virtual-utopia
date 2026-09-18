<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { homeMaterialMap } from '../data/homeMaterials.js';
import { worldStore } from '../stores/worldStore.js';
import {
  clamp,
  createHomeLayout,
  createIsoDiamond,
  drawDiamond,
  drawPolygon,
  pointInPolygon,
  screenToWorld,
  TILE_HEIGHT,
  TILE_WIDTH,
  worldToScreen,
} from '../utils/isometric.js';

const props = defineProps({
  selectedPlotId: {
    type: String,
    default: '',
  },
  selectedItemId: {
    type: String,
    default: '',
  },
  selectedMaterialId: {
    type: String,
    default: '',
  },
  editMode: {
    type: Boolean,
    default: false,
  },
  nightFactor: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits([
  'select-building',
  'select-plot',
  'select-item',
  'place-material',
  'move-item',
  'clear-selection',
]);

const homeLayoutResult = createHomeLayout({
  count: 50,
});

const canvasRef = ref(null);
const wrapperRef = ref(null);
const viewport = reactive({
  width: 1,
  height: 1,
});
const pointer = reactive({
  x: 0,
  y: 0,
  inside: false,
});
const hover = ref(null);
const selectedLandmark = ref(null);
const camera = reactive({
  panX: 0,
  panY: 20,
  zoom: 0.92,
});
const activePointers = new Map();
const interaction = {
  dragging: false,
  moved: false,
  itemId: null,
  startX: 0,
  startY: 0,
  startPanX: 0,
  startPanY: 0,
  pinchDistance: 0,
  pinchZoom: 1,
  pinchMidX: 0,
  pinchMidY: 0,
  pinchPanX: 0,
  pinchPanY: 0,
};

const publicBuildings = [
  {
    id: 'yard',
    sceneId: 'yard',
    name: '生态客厅',
    x: 7.2,
    y: 7.7,
    color: '#9f5747',
    type: 'yard',
  },
  {
    id: 'resource-wall',
    sceneId: 'resource-wall',
    name: '军械库',
    x: 10.4,
    y: 8.1,
    color: '#536f6a',
    type: 'resource',
  },
  {
    id: 'pavilion',
    sceneId: 'pavilion',
    name: '议事堂',
    x: 8.3,
    y: 9.8,
    color: '#6a5d7d',
    type: 'pavilion',
  },
  {
    id: 'library',
    sceneId: 'library',
    name: '藏书阁',
    x: 5.2,
    y: 9.4,
    color: '#9d7549',
    type: 'library',
  },
  {
    id: 'cabin',
    sceneId: 'cabin',
    name: '客舍',
    x: 11.8,
    y: 11,
    color: '#8f5d65',
    type: 'cabin',
  },
  {
    id: 'far-forest',
    sceneId: 'far-forest',
    name: '森林观测站',
    x: 3.2,
    y: 12.9,
    color: '#4d704b',
    type: 'forest',
  },
];

const forestTrees = Array.from({ length: 72 }, (_, index) => ({
  id: `forest-${index}`,
  x: -2 + ((index * 7) % 20),
  y: 0.5 + ((index * 11) % 18),
  size: 0.72 + ((index * 13) % 9) / 10,
  layer: index % 3,
}));

const getLightIntensity = () => {
  const value = clamp((props.nightFactor - 0.12) / 0.76, 0, 1);

  return value * value * (3 - 2 * value);
};

const moatOuterWorldPolygon = [
  { x: -8.2, y: -3.4 },
  { x: 20.2, y: -3.3 },
  { x: 25.8, y: 8.5 },
  { x: 20.8, y: 23.9 },
  { x: -4.4, y: 24 },
  { x: -10, y: 8.8 },
];

const cityGroundWorldPolygon = [
  { x: -5.3, y: -1.1 },
  { x: 18.2, y: -1.1 },
  { x: 23.1, y: 7.8 },
  { x: 18.8, y: 21.1 },
  { x: -3.1, y: 21.2 },
  { x: -7.2, y: 8.1 },
];

const wallWorldPolygon = [
  { x: -0.8, y: 0.6 },
  { x: 13.9, y: 0.6 },
  { x: 17.4, y: 7.2 },
  { x: 14.3, y: 15.9 },
  { x: -0.2, y: 15.9 },
  { x: -3.2, y: 7.3 },
];

const cityGates = [
  { id: 'gate-north', x: 6.8, y: 0.6, label: '北门', angle: 0 },
  { id: 'gate-east', x: 17.4, y: 7.2, label: '东门', angle: 90 },
  { id: 'gate-south', x: 7.2, y: 15.9, label: '南门', angle: 180 },
  { id: 'gate-west', x: -3.2, y: 7.3, label: '西门', angle: 270 },
];

const plotPositionMap = new Map(
  homeLayoutResult.homes.map((home) => [home.number, home]),
);

const getPlotWorldPosition = (home) =>
  plotPositionMap.get(home.number) || {
    x: 8,
    y: 10,
  };

const getPlotDimensions = (home) => ({
  halfWidth: plotPositionMap.get(home.number)?.halfWidth ?? 0.46,
  halfHeight: plotPositionMap.get(home.number)?.halfHeight ?? 0.34,
});

const mainStreetWorldPath = [
  { x: 6.8, y: 1.2 },
  { x: 7.2, y: 3.4 },
  { x: 7.8, y: 5.4 },
  { x: 8.1, y: 8.1 },
  { x: 8.4, y: 10.6 },
  { x: 8.2, y: 12.9 },
  { x: 7.4, y: 15.2 },
];

const crossStreetWorldPath = [
  { x: -2.6, y: 7.3 },
  { x: 1.2, y: 7.7 },
  { x: 4.4, y: 8.6 },
  { x: 8.4, y: 10.6 },
  { x: 11.8, y: 10.1 },
  { x: 15.8, y: 8.2 },
  { x: 17, y: 7.3 },
];

const branchRoads = [
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
];

const roadReferencePoints = [
  ...mainStreetWorldPath,
  ...crossStreetWorldPath,
  ...branchRoads.flat(),
];

const getNearestRoadPoint = (position) =>
  roadReferencePoints.reduce((nearest, point) => {
    const distance = (point.x - position.x) ** 2 + (point.y - position.y) ** 2;

    return !nearest || distance < nearest.distance
      ? {
          ...point,
          distance,
        }
      : nearest;
  }, null);

const trainingGround = {
  id: 'training-ground',
  x: 13.5,
  y: 13.4,
  label: '社区花园',
  detail: '居民休憩、自然种植与社区交流的生态花园',
  type: 'training-ground',
  halfWidth: 1.72,
  halfHeight: 1.28,
};

const defenseNodes = [
  {
    id: 'tower-northwest',
    x: -0.8,
    y: 1.3,
    label: '北岭观测站',
    type: 'arrowtower',
    detail: '监测北侧林区、山地气候与生态变化',
  },
  {
    id: 'tower-southeast',
    x: 14.5,
    y: 15.4,
    label: '南岭观测站',
    type: 'arrowtower',
    detail: '监测南侧聚落、植被覆盖与山地安全',
  },
  {
    id: 'beacon-east',
    x: 15.3,
    y: 5.2,
    label: '森林信号塔',
    type: 'beacon',
    detail: '承担森林火险、气候和设备状态预警',
  },
];

const isSceneryPositionClear = (point) => {
  const nearHome = homeLayoutResult.homes.some(
    (home) => Math.hypot(point.x - home.x, point.y - home.y) < 1.02,
  );
  const nearPublicBuilding = publicBuildings.some(
    (building) => Math.hypot(point.x - building.x, point.y - building.y) < 1.28,
  );
  const nearDefenseNode = defenseNodes.some(
    (node) => Math.hypot(point.x - node.x, point.y - node.y) < 1.1,
  );
  const aroundCentralPlaza =
    point.x > 4.8 && point.x < 11.7 && point.y > 8 && point.y < 13.7;

  return (
    !nearHome && !nearPublicBuilding && !nearDefenseNode && !aroundCentralPlaza
  );
};

const sceneryVegetation = Array.from({ length: 120 }, (_, index) => {
  const angle = index * 2.399963229728653;
  const radius = 3.7 + (index % 13) * 0.58;

  return {
    id: `scenery-vegetation-${index}`,
    x: 8.4 + Math.cos(angle) * radius * 1.08,
    y: 10.6 + Math.sin(angle) * radius * 0.68,
    type: ['tree', 'bush', 'grass', 'flower'][index % 4],
    scale: 0.62 + ((index * 7) % 8) / 10,
  };
}).filter(
  (item) =>
    item.x > -5.2 &&
    item.x < 20.2 &&
    item.y > 0.2 &&
    item.y < 20.6 &&
    isSceneryPositionClear(item),
);

const plazaWorldPoints = [
  { id: 'plaza-central', x: 8.4, y: 10.6, label: '生活广场' },
  { id: 'plaza-market', x: 5.5, y: 7.8, label: '林间市集' },
  { id: 'plaza-south', x: 7.4, y: 15.2, label: '南谷生态平台' },
];

const centralPlazaWorldPolygon = [
  { x: 6.1, y: 8.5 },
  { x: 9.4, y: 8.2 },
  { x: 11.4, y: 9.6 },
  { x: 11.2, y: 12.2 },
  { x: 9.4, y: 13.5 },
  { x: 6.6, y: 13.3 },
  { x: 5.2, y: 11.7 },
];

const roadNodes = [
  ...plazaWorldPoints,
  { id: 'road-main-north', x: 7.4, y: 4.2, label: '北岭生态廊道' },
  { id: 'road-main-south', x: 7.8, y: 13.6, label: '南谷引导廊道' },
  { id: 'road-east-gate', x: 15.4, y: 8.4, label: '东侧空中连廊' },
  { id: 'road-west-gate', x: 0.2, y: 7.5, label: '西侧引导轨道' },
  ...branchRoads.flatMap((road, index) => [
    {
      id: `lane-${index}-west`,
      x: road[1].x,
      y: road[1].y,
      label: `${index + 1} 号巷口`,
    },
    {
      id: `lane-${index}-east`,
      x: road[3].x,
      y: road[3].y,
      label: `${index + 1} 号生态支路`,
    },
  ]),
];

const roadDecorations = Array.from({ length: 56 }, (_, index) => {
  const path =
    index % 5 === 0
      ? mainStreetWorldPath
      : index % 5 === 1
        ? crossStreetWorldPath
        : branchRoads[index % branchRoads.length];
  const segmentIndex = Math.floor(index / 5) % (path.length - 1);
  const segment = path[segmentIndex];
  const next = path[segmentIndex + 1];
  const progress = ((index * 37) % 100) / 100;
  const side = index % 2 === 0 ? -1 : 1;
  const x = segment.x + (next.x - segment.x) * progress;
  const y =
    segment.y +
    (next.y - segment.y) * progress +
    side * (0.3 + (index % 4) * 0.07);
  const type = [
    'stone-lamp',
    'wood-post',
    'banner',
    'bush',
    'grass',
    'flower',
    'tree',
  ][index % 7];

  return {
    id: `road-deco-${index}`,
    x,
    y,
    type,
    scale: 0.72 + ((index * 11) % 7) / 10,
  };
});

const plazaDecorations = [
  { id: 'plaza-banner-1', x: 6.9, y: 9.1, type: 'banner', scale: 1.2 },
  { id: 'plaza-banner-2', x: 9.8, y: 9.4, type: 'banner', scale: 1.2 },
  { id: 'plaza-lamp-1', x: 6.5, y: 12, type: 'stone-lamp', scale: 1.18 },
  { id: 'plaza-lamp-2', x: 10.3, y: 11.1, type: 'stone-lamp', scale: 1.18 },
  { id: 'plaza-tree-1', x: 4.5, y: 11.9, type: 'tree', scale: 1.28 },
  { id: 'plaza-tree-2', x: 12.7, y: 8.7, type: 'tree', scale: 1.2 },
  { id: 'plaza-bush-1', x: 6.1, y: 8.9, type: 'bush', scale: 1.1 },
  { id: 'plaza-bush-2', x: 10.7, y: 12.4, type: 'bush', scale: 1.1 },
];

const getCanvasContext = () => {
  const canvas = canvasRef.value;

  if (!canvas) {
    return null;
  }

  return canvas.getContext('2d');
};

const toIsoPoint = (world) =>
  worldToScreen({
    ...world,
    camera,
    viewport,
  });

let animationFrame = 0;
let resizeObserver;
let startTime = performance.now();

const colorWithAlpha = (hex, alpha) => {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const blendHex = (fromHex, toHex, amount) => {
  const from = Number.parseInt(fromHex.replace('#', ''), 16);
  const to = Number.parseInt(toHex.replace('#', ''), 16);
  const mix = (shift) => {
    const fromValue = (from >> shift) & 255;
    const toValue = (to >> shift) & 255;

    return Math.round(fromValue + (toValue - fromValue) * amount);
  };

  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
};

const drawMountainLayer = (context, time, parallax, baseY, color) => {
  const offsetX = camera.panX * parallax;
  const offsetY = camera.panY * parallax * 0.4;
  const scale = clamp(camera.zoom, 0.72, 1.12);
  const drift = Math.sin(time * 0.00005) * 18;

  context.save();
  context.translate(offsetX + drift, offsetY);
  context.scale(scale, scale);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(-120, baseY);

  for (let index = 0; index <= 12; index += 1) {
    const x = -120 + index * 130;
    const peak = baseY - 80 - ((index * 47) % 90) - Math.sin(index * 0.9) * 18;
    context.lineTo(x + 58, peak);
    context.lineTo(x + 120, baseY);
  }

  context.lineTo(viewport.width + 180, baseY);
  context.lineTo(viewport.width + 180, viewport.height);
  context.lineTo(-120, viewport.height);
  context.closePath();
  context.fill();
  context.restore();
};

const drawClouds = (context, time) => {
  const cloudColor =
    props.nightFactor > 0.55
      ? 'rgba(128, 150, 190, 0.18)'
      : 'rgba(255, 255, 255, 0.54)';

  context.save();
  context.translate(camera.panX * 0.1, camera.panY * 0.06);

  for (let index = 0; index < 7; index += 1) {
    const x =
      ((time * 0.008 + index * 260 + camera.panX * 0.08) %
        (viewport.width + 340)) -
      170;
    const y = 90 + (index % 3) * 90;
    const scale = 0.8 + (index % 4) * 0.16;

    context.fillStyle = cloudColor;
    context.beginPath();
    context.ellipse(x, y, 68 * scale, 22 * scale, 0, 0, Math.PI * 2);
    context.ellipse(
      x + 42 * scale,
      y - 14 * scale,
      54 * scale,
      24 * scale,
      0,
      0,
      Math.PI * 2,
    );
    context.ellipse(
      x - 46 * scale,
      y + 4 * scale,
      46 * scale,
      18 * scale,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.restore();
};

const drawMoat = (context, time) => {
  const outer = moatOuterWorldPolygon.map(toIsoPoint);
  const terraceLevels = [
    { scale: 1, offsetY: 0, color: '#314b3f' },
    { scale: 0.91, offsetY: -10, color: '#3f5d49' },
    { scale: 0.79, offsetY: -20, color: '#54705a' },
    { scale: 0.67, offsetY: -30, color: '#6b8468' },
    { scale: 0.54, offsetY: -40, color: '#899c80' },
  ];
  const screenCenter = outer.reduce(
    (result, point) => ({
      x: result.x + point.x / outer.length,
      y: result.y + point.y / outer.length,
    }),
    { x: 0, y: 0 },
  );
  const scalePolygon = (points, scale, offsetY) =>
    points.map((point) => ({
      x: screenCenter.x + (point.x - screenCenter.x) * scale,
      y:
        screenCenter.y +
        (point.y - screenCenter.y) * scale +
        offsetY * camera.zoom,
    }));

  context.save();
  for (const terrace of terraceLevels) {
    const points = scalePolygon(outer, terrace.scale, terrace.offsetY);
    const depth = points.map((point) => ({
      x: point.x,
      y: point.y + 17 * camera.zoom,
    }));
    drawPolygon(
      context,
      depth,
      props.nightFactor > 0.5 ? '#182a25' : '#435641',
      null,
    );
    drawPolygon(
      context,
      points,
      props.nightFactor > 0.5
        ? colorWithAlpha(terrace.color, 0.74)
        : terrace.color,
      'rgba(33, 57, 45, 0.52)',
      1.7,
    );
  }

  context.lineCap = 'round';
  for (let index = 0; index < 5; index += 1) {
    const points = scalePolygon(outer, 0.9 - index * 0.09, -10 - index * 10);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      context.lineTo(points[pointIndex].x, points[pointIndex].y);
    }

    context.closePath();
    context.strokeStyle = 'rgba(211, 229, 207, 0.18)';
    context.lineWidth = 1.2 * camera.zoom;
    context.stroke();
  }
  context.restore();

  void time;
};

const drawCurvedWorldPath = (
  context,
  worldPoints,
  { color, width, dash = [], dashOffset = 0 },
) => {
  const points = worldPoints.map(toIsoPoint);

  context.save();
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) / 2,
      (current.y + next.y) / 2,
    );
  }

  const last = points.at(-1);
  context.lineTo(last.x, last.y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash(dash);
  context.lineDashOffset = dashOffset;
  context.stroke();
  context.restore();
};

const drawRoadNetwork = (context, time) => {
  const zoom = camera.zoom;

  drawCurvedWorldPath(context, mainStreetWorldPath, {
    color: 'rgba(41, 69, 61, 0.42)',
    width: 32 * zoom,
  });
  drawCurvedWorldPath(context, mainStreetWorldPath, {
    color: props.nightFactor > 0.5 ? '#8fa9a0' : '#edf6f1',
    width: 25 * zoom,
  });
  drawCurvedWorldPath(context, mainStreetWorldPath, {
    color: 'rgba(221, 250, 240, 0.6)',
    width: 2.2 * zoom,
    dash: [8 * zoom, 16 * zoom],
    dashOffset: -time * 0.006,
  });

  drawCurvedWorldPath(context, crossStreetWorldPath, {
    color: 'rgba(41, 69, 61, 0.38)',
    width: 25 * zoom,
  });
  drawCurvedWorldPath(context, crossStreetWorldPath, {
    color: props.nightFactor > 0.5 ? '#8da89e' : '#eaf4ef',
    width: 19 * zoom,
  });

  for (const road of branchRoads) {
    drawCurvedWorldPath(context, road, {
      color: 'rgba(44, 73, 64, 0.32)',
      width: 17 * zoom,
    });
    drawCurvedWorldPath(context, road, {
      color: props.nightFactor > 0.5 ? '#90aaa0' : '#e7f2ed',
      width: 12 * zoom,
    });
  }

  for (const home of worldStore.state.homes) {
    const position = getPlotWorldPosition(home);
    const road = getNearestRoadPoint(position);

    drawCurvedWorldPath(
      context,
      [
        { x: position.x, y: position.y - 0.44 },
        {
          x: position.x + Math.sin(home.number) * 0.08,
          y: position.y - 0.72,
        },
        {
          x: road.x,
          y: road.y,
        },
      ],
      {
        color: 'rgba(80, 70, 58, 0.28)',
        width: 7.5 * zoom,
      },
    );
    drawCurvedWorldPath(
      context,
      [
        { x: position.x, y: position.y - 0.44 },
        {
          x: position.x + Math.sin(home.number) * 0.08,
          y: position.y - 0.72,
        },
        {
          x: road.x,
          y: road.y,
        },
      ],
      {
        color: props.nightFactor > 0.5 ? '#c4b59d' : '#eadcc2',
        width: 4.2 * zoom,
      },
    );
  }

  for (const plaza of plazaWorldPoints) {
    if (plaza.id === 'plaza-central') {
      continue;
    }

    const points = createIsoDiamond({
      x: plaza.x,
      y: plaza.y,
      halfWidth: 0.78,
      halfHeight: 0.58,
      camera,
      viewport,
    });
    drawPolygon(
      context,
      points,
      props.nightFactor > 0.5
        ? 'rgba(112, 139, 128, 0.94)'
        : 'rgba(226, 240, 233, 0.96)',
      'rgba(102, 89, 72, 0.38)',
      1.5,
    );
    const center = toIsoPoint(plaza);
    context.strokeStyle = 'rgba(118, 103, 82, 0.45)';
    context.lineWidth = 1.2 * camera.zoom;
    context.beginPath();
    context.ellipse(
      center.x,
      center.y,
      25 * camera.zoom,
      12 * camera.zoom,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
};

const drawCentralPlaza = (context, time) => {
  const points = centralPlazaWorldPolygon.map(toIsoPoint);
  const center = toIsoPoint({
    x: 8.4,
    y: 10.7,
  });
  const highlighted =
    hover.value?.type === 'landmark' && hover.value.id === 'plaza-central';
  const lightIntensity = getLightIntensity();

  drawPolygon(
    context,
    points,
    highlighted
      ? 'rgba(226, 240, 232, 0.96)'
      : props.nightFactor > 0.5
        ? 'rgba(91, 112, 103, 0.96)'
        : 'rgba(190, 211, 196, 0.96)',
    highlighted ? '#d9fff0' : 'rgba(92, 130, 107, 0.72)',
    highlighted ? 3 : 2.3,
  );

  context.save();
  context.strokeStyle = 'rgba(220, 249, 233, 0.72)';
  context.lineWidth = 2.2 * camera.zoom;
  context.fillStyle =
    props.nightFactor > 0.5
      ? 'rgba(216, 231, 224, 0.72)'
      : 'rgba(247, 252, 248, 0.94)';
  context.beginPath();
  context.ellipse(
    center.x,
    center.y,
    92 * camera.zoom,
    43 * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();

  context.fillStyle = 'rgba(105, 170, 152, 0.52)';
  context.beginPath();
  context.ellipse(
    center.x,
    center.y - 4 * camera.zoom,
    69 * camera.zoom,
    26 * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  context.beginPath();
  context.ellipse(
    center.x - 8 * camera.zoom,
    center.y - 10 * camera.zoom,
    47 * camera.zoom,
    18 * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.stroke();

  context.fillStyle = 'rgba(74, 126, 108, 0.48)';
  context.beginPath();
  context.ellipse(
    center.x + 36 * camera.zoom,
    center.y - 2 * camera.zoom,
    16 * camera.zoom,
    9 * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.ellipse(
    center.x - 39 * camera.zoom,
    center.y + 7 * camera.zoom,
    13 * camera.zoom,
    7 * camera.zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  if (lightIntensity > 0.02) {
    const coreGlow = context.createRadialGradient(
      center.x,
      center.y - 22 * camera.zoom,
      0,
      center.x,
      center.y - 22 * camera.zoom,
      52 * camera.zoom,
    );
    coreGlow.addColorStop(0, `rgba(197, 255, 231, ${0.54 * lightIntensity})`);
    coreGlow.addColorStop(1, 'rgba(197, 255, 231, 0)');
    context.fillStyle = coreGlow;
    context.beginPath();
    context.arc(
      center.x,
      center.y - 22 * camera.zoom,
      52 * camera.zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else {
    context.fillStyle = 'rgba(237, 255, 248, 0.88)';
    context.beginPath();
    context.arc(
      center.x,
      center.y - 18 * camera.zoom,
      9 * camera.zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();

  void time;
};

const drawRoadDecoration = (context, decoration, time) => {
  const point = toIsoPoint(decoration);
  const zoom = camera.zoom;
  const sway = Math.sin(time * 0.0018 + decoration.x * 3 + decoration.y) * 1.7;
  const lightIntensity = getLightIntensity();

  if (decoration.type === 'tree') {
    drawIsoTree(context, point, {
      color: props.nightFactor > 0.5 ? '#2d5848' : '#447d58',
      scale: decoration.scale,
      sway,
    });
    return;
  }

  context.save();
  context.translate(point.x, point.y);

  if (decoration.type === 'bush') {
    context.fillStyle = props.nightFactor > 0.5 ? '#315b45' : '#5d8b58';
    context.beginPath();
    context.ellipse(
      sway,
      -5 * zoom,
      8 * decoration.scale * zoom,
      5 * decoration.scale * zoom,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  } else if (decoration.type === 'flower') {
    context.fillStyle = decoration.scale % 0.2 > 0.1 ? '#e7c15c' : '#d98386';
    for (let index = 0; index < 5; index += 1) {
      context.beginPath();
      context.arc(
        (index - 2) * 4 * zoom + sway,
        -5 * zoom - (index % 2) * 3 * zoom,
        2.2 * zoom,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else if (decoration.type === 'grass') {
    context.strokeStyle = '#648c4d';
    context.lineWidth = 1.1 * zoom;
    for (let index = -2; index <= 2; index += 1) {
      context.beginPath();
      context.moveTo(index * 2.4 * zoom, 0);
      context.quadraticCurveTo(
        index * 2.4 * zoom + sway,
        -5 * zoom,
        index * 2.2 * zoom - sway,
        -9 * zoom,
      );
      context.stroke();
    }
  } else if (decoration.type === 'stone-lamp') {
    context.strokeStyle = '#4d5753';
    context.lineWidth = 2.2 * zoom;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -20 * zoom);
    context.stroke();
    context.fillStyle = '#f4d48b';
    context.beginPath();
    context.arc(0, -21 * zoom, 4 * zoom, 0, Math.PI * 2);
    context.fill();

    if (lightIntensity > 0.02) {
      const glow = context.createRadialGradient(
        0,
        -21 * zoom,
        0,
        0,
        -21 * zoom,
        30 * zoom,
      );
      glow.addColorStop(0, `rgba(255, 220, 133, ${0.58 * lightIntensity})`);
      glow.addColorStop(1, 'rgba(255, 220, 133, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(
        0,
        -21 * zoom,
        (20 + 10 * lightIntensity) * zoom,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else if (decoration.type === 'wood-post') {
    context.fillStyle = '#765236';
    context.fillRect(-2 * zoom, -14 * zoom, 4 * zoom, 14 * zoom);
    context.fillRect(-8 * zoom, -12 * zoom, 16 * zoom, 3 * zoom);
  } else if (decoration.type === 'banner') {
    drawFlag(
      context,
      { x: 0, y: 0 },
      time,
      decoration.scale > 1 ? '#8e4035' : '#956d38',
      decoration.scale,
      31,
    );
  } else if (decoration.type === 'bench') {
    context.fillStyle = '#9f704b';
    context.fillRect(-10 * zoom, -6 * zoom, 20 * zoom, 4 * zoom);
    context.fillRect(-7 * zoom, -2 * zoom, 3 * zoom, 5 * zoom);
    context.fillRect(4 * zoom, -2 * zoom, 3 * zoom, 5 * zoom);
  } else if (decoration.type === 'flowerbed') {
    context.fillStyle = '#a88d6d';
    drawDiamond(context, { x: 0, y: 0 }, 28 * zoom, 14 * zoom);
    context.fill();
    context.fillStyle = '#6c9a5c';
    context.beginPath();
    context.ellipse(sway, -4 * zoom, 9 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8bd5c';
    context.beginPath();
    context.arc(sway - 4 * zoom, -8 * zoom, 2.2 * zoom, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d87f81';
    context.beginPath();
    context.arc(sway + 4 * zoom, -7 * zoom, 2.2 * zoom, 0, Math.PI * 2);
    context.fill();
  } else if (decoration.type === 'dandelion') {
    context.strokeStyle = '#6c8f56';
    context.lineWidth = 1 * zoom;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(sway, -8 * zoom);
    context.stroke();
    context.fillStyle = 'rgba(255, 255, 255, 0.86)';
    context.beginPath();
    context.arc(sway, -9 * zoom, 2.5 * zoom, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
};

const drawFlag = (context, point, time, color, scale = 1, height = 32) => {
  const zoom = camera.zoom;
  const wave = Math.sin(time * 0.003 + point.x * 0.04) * 4;

  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = '#5a4434';
  context.lineWidth = 1.7 * zoom * scale;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, -height * zoom * scale);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, -height * zoom * scale);
  context.quadraticCurveTo(
    (13 + wave) * zoom * scale,
    (-height - 4) * zoom * scale,
    (24 + wave) * zoom * scale,
    -height * zoom * scale,
  );
  context.lineTo((4 + wave * 0.4) * zoom * scale, (-height + 7) * zoom * scale);
  context.closePath();
  context.fill();
  context.restore();
};

const drawBridge = (context, gate, time) => {
  const point = toIsoPoint(gate);
  const zoom = camera.zoom;

  context.save();
  context.translate(point.x, point.y);
  context.rotate((gate.angle * Math.PI) / 180);
  context.fillStyle = props.nightFactor > 0.5 ? '#8c806d' : '#ac9b80';
  context.strokeStyle = '#665b4c';
  context.lineWidth = 2 * zoom;
  context.beginPath();
  context.roundRect(-38 * zoom, -17 * zoom, 76 * zoom, 34 * zoom, 5 * zoom);
  context.fill();
  context.stroke();
  context.strokeStyle = 'rgba(84, 70, 53, 0.42)';
  context.lineWidth = 1 * zoom;

  for (let index = -3; index <= 3; index += 1) {
    context.beginPath();
    context.moveTo(index * 10 * zoom, -17 * zoom);
    context.lineTo(index * 10 * zoom, 17 * zoom);
    context.stroke();
  }

  context.strokeStyle = '#6f5f4c';
  context.lineWidth = 2.5 * zoom;
  context.beginPath();
  context.moveTo(-34 * zoom, -21 * zoom);
  context.lineTo(34 * zoom, -21 * zoom);
  context.moveTo(-34 * zoom, 21 * zoom);
  context.lineTo(34 * zoom, 21 * zoom);
  context.stroke();
  context.restore();
};

const drawGateHouse = (context, gate, time) => {
  const point = toIsoPoint(gate);
  const zoom = camera.zoom;
  const width = 58 * zoom;
  const depth = 27 * zoom;
  const height = 45 * zoom;

  context.save();
  context.translate(point.x, point.y);
  context.save();
  context.rotate((gate.angle * Math.PI) / 180);
  drawDiamond(context, { x: 0, y: 3 * zoom }, width * 1.38, depth * 1.05);
  context.fillStyle = 'rgba(44, 42, 37, 0.38)';
  context.fill();
  context.restore();
  context.shadowColor = 'rgba(31, 29, 24, 0.36)';
  context.shadowBlur = 16 * zoom;
  context.shadowOffsetY = 9 * zoom;
  context.fillStyle = '#7e735f';
  context.beginPath();
  context.moveTo(-width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(-width / 2, -height);
  context.closePath();
  context.fill();
  context.fillStyle = '#938774';
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(width / 2, -height);
  context.closePath();
  context.fill();
  context.shadowColor = 'transparent';

  context.fillStyle = '#312d29';
  const doorShift = [0, width * 0.12, 0, -width * 0.12][gate.angle / 90];
  context.beginPath();
  context.moveTo(doorShift - width * 0.12, 0);
  context.lineTo(0, depth * 0.42);
  context.lineTo(0, depth * 0.42 - height * 0.52);
  context.lineTo(doorShift + width * 0.08, -height * 0.52);
  context.closePath();
  context.fill();
  context.fillStyle = '#4c4238';
  context.beginPath();
  context.moveTo(-width * 0.66, -height);
  context.lineTo(0, -height - depth * 0.92);
  context.lineTo(width * 0.66, -height);
  context.lineTo(0, -height + depth * 0.7);
  context.closePath();
  context.fill();
  context.strokeStyle = '#b7a888';
  context.lineWidth = 1.5 * zoom;
  context.beginPath();
  context.moveTo(-width * 0.52, -height * 0.16);
  context.lineTo(width * 0.52, -height * 0.16);
  context.stroke();
  context.restore();

  drawFlag(
    context,
    {
      x: point.x - 18 * camera.zoom,
      y: point.y - 30 * camera.zoom,
    },
    time,
    '#8e493d',
    0.82,
    34,
  );
  drawFlag(
    context,
    {
      x: point.x + 18 * camera.zoom,
      y: point.y - 30 * camera.zoom,
    },
    time,
    '#876b40',
    0.82,
    34,
  );
};

const drawCityWalls = (context, time) => {
  const wall = wallWorldPolygon.map(toIsoPoint);
  const wallDepth = wall.map((point) => ({
    x: point.x,
    y: point.y + 18 * camera.zoom,
  }));
  drawPolygon(
    context,
    wallDepth,
    props.nightFactor > 0.5 ? '#3a3d37' : '#706c5f',
    null,
  );
  drawPolygon(
    context,
    wall,
    props.nightFactor > 0.5 ? '#66685d' : '#99917d',
    'rgba(57, 55, 48, 0.82)',
    2.2,
  );

  context.save();
  context.strokeStyle = props.nightFactor > 0.5 ? '#b5ae96' : '#d1c6a8';
  context.lineWidth = 1.5 * camera.zoom;

  for (let edge = 0; edge < wall.length; edge += 1) {
    const start = wall[edge];
    const end = wall[(edge + 1) % wall.length];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const count = Math.max(3, Math.floor(distance / 24));

    for (let index = 1; index < count; index += 1) {
      const progress = index / count;
      const x = start.x + (end.x - start.x) * progress;
      const y = start.y + (end.y - start.y) * progress;
      context.fillStyle = props.nightFactor > 0.5 ? '#6f7165' : '#a69d87';
      context.fillRect(
        x - 4 * camera.zoom,
        y - 8 * camera.zoom,
        8 * camera.zoom,
        8 * camera.zoom,
      );
    }
  }

  context.restore();

  for (const gate of cityGates) {
    drawBridge(context, gate, time);
  }
};

const drawTrainingGround = (context, time) => {
  const center = toIsoPoint(trainingGround);
  const zoom = camera.zoom;
  const points = createIsoDiamond({
    x: trainingGround.x,
    y: trainingGround.y,
    halfWidth: trainingGround.halfWidth,
    halfHeight: trainingGround.halfHeight,
    camera,
    viewport,
  });
  const highlighted =
    hover.value?.type === 'landmark' && hover.value.id === trainingGround.id;

  drawPolygon(
    context,
    points,
    highlighted
      ? 'rgba(217, 190, 128, 0.96)'
      : props.nightFactor > 0.5
        ? 'rgba(118, 102, 77, 0.95)'
        : 'rgba(190, 166, 116, 0.94)',
    highlighted ? '#ffe9a8' : 'rgba(91, 69, 45, 0.68)',
    highlighted ? 2.8 : 2,
  );

  context.save();
  context.translate(center.x, center.y);
  context.strokeStyle = 'rgba(224, 247, 234, 0.78)';
  context.lineWidth = 2 * zoom;
  context.beginPath();
  context.ellipse(0, 0, 48 * zoom, 25 * zoom, 0, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.ellipse(0, 0, 30 * zoom, 15 * zoom, 0, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = 'rgba(79, 143, 102, 0.78)';
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    context.beginPath();
    context.arc(
      Math.cos(angle) * 27 * zoom,
      Math.sin(angle) * 13 * zoom,
      4 * zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.fillStyle = 'rgba(247, 255, 249, 0.88)';
  context.beginPath();
  context.ellipse(0, 0, 12 * zoom, 6 * zoom, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    drawFlag(
      context,
      {
        x: center.x + Math.cos(angle) * 42 * zoom,
        y: center.y + Math.sin(angle) * 22 * zoom,
      },
      time,
      index % 2 === 0 ? '#8f3f34' : '#9b7439',
      0.72,
      28,
    );
  }
};

const getDefenseWallAngle = (node) => {
  const wallPoints = wallWorldPolygon.map(toIsoPoint);
  let nearest = null;

  for (let index = 0; index < wallPoints.length; index += 1) {
    const start = wallPoints[index];
    const end = wallPoints[(index + 1) % wallPoints.length];
    const worldStart = wallWorldPolygon[index];
    const worldEnd = wallWorldPolygon[(index + 1) % wallWorldPolygon.length];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const worldDeltaX = worldEnd.x - worldStart.x;
    const worldDeltaY = worldEnd.y - worldStart.y;
    const lengthSquared = worldDeltaX * worldDeltaX + worldDeltaY * worldDeltaY;
    const progress = Math.min(
      1,
      Math.max(
        0,
        ((node.x - worldStart.x) * worldDeltaX +
          (node.y - worldStart.y) * worldDeltaY) /
          Math.max(1, lengthSquared),
      ),
    );
    const closestX = start.x + deltaX * progress;
    const closestY = start.y + deltaY * progress;
    const screen = toIsoPoint(node);
    const distance = Math.hypot(screen.x - closestX, screen.y - closestY);

    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        angle: Math.atan2(deltaY, deltaX),
      };
    }
  }

  return nearest?.angle || 0;
};

const drawDefenseNode = (context, node, time) => {
  const point = toIsoPoint(node);
  const zoom = camera.zoom;
  const wallAngle = getDefenseWallAngle(node);
  const lightIntensity = getLightIntensity();
  const highlighted =
    hover.value?.type === 'landmark' && hover.value.id === node.id;
  const width = (node.type === 'beacon' ? 32 : 29) * zoom;
  const height = (node.type === 'beacon' ? 46 : 41) * zoom;

  context.save();
  context.translate(point.x, point.y);
  context.save();
  context.rotate(wallAngle);
  drawDiamond(context, { x: 0, y: 3 * zoom }, width * 1.45, width * 0.72);
  context.fillStyle = 'rgba(51, 49, 43, 0.38)';
  context.fill();
  context.restore();
  context.shadowColor = highlighted
    ? 'rgba(255, 231, 153, 0.9)'
    : 'rgba(22, 30, 25, 0.3)';
  context.shadowBlur = highlighted ? 16 : 9;
  context.shadowOffsetY = 6 * zoom;
  context.fillStyle = '#dbe9e3';
  context.beginPath();
  context.moveTo(-width / 2, 0);
  context.lineTo(0, width / 4);
  context.lineTo(0, width / 4 - height);
  context.lineTo(-width / 2, -height);
  context.closePath();
  context.fill();
  context.fillStyle = '#c3d8cf';
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(0, width / 4);
  context.lineTo(0, width / 4 - height);
  context.lineTo(width / 2, -height);
  context.closePath();
  context.fill();
  context.fillStyle = '#2f5d4b';
  context.beginPath();
  context.moveTo(-width * 0.62, -height);
  context.lineTo(0, -height - width * 0.52);
  context.lineTo(width * 0.62, -height);
  context.lineTo(0, -height + width * 0.3);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgba(84, 145, 105, 0.78)';
  context.beginPath();
  context.ellipse(
    0,
    -height - width * 0.12,
    width * 0.42,
    width * 0.14,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.shadowColor = 'transparent';
  context.strokeStyle = '#5eaaa5';
  context.lineWidth = 1.2 * zoom;

  for (let index = -1; index <= 1; index += 1) {
    context.save();
    context.translate(index * 8 * zoom, -height * 0.67);
    context.rotate(wallAngle);
    context.fillStyle = '#35332e';
    context.fillRect(-3 * zoom, -1.5 * zoom, 6 * zoom, 3 * zoom);
    context.restore();
  }

  context.strokeStyle = '#6d4c35';
  context.lineWidth = 2 * zoom;
  context.beginPath();
  context.moveTo(width * 0.28, -height * 0.48);
  context.lineTo(width * 0.28, 4 * zoom);
  context.moveTo(width * 0.28, -height * 0.25);
  context.lineTo(width * 0.46, 2 * zoom);
  context.stroke();

  if (node.type === 'beacon' && lightIntensity > 0.02) {
    const smoke = 40;
    context.fillStyle = `rgba(93, 91, 82, ${0.22 + lightIntensity * 0.25})`;

    for (let index = 0; index < 4; index += 1) {
      const drift = Math.sin(time * 0.0015 + index) * 13;
      context.beginPath();
      context.arc(
        drift * zoom,
        (-height - smoke - index * 17) * zoom,
        (9 + index * 3) * zoom,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    const glow = context.createRadialGradient(
      0,
      -height * 0.2,
      0,
      0,
      -height * 0.2,
      34 * zoom,
    );
    glow.addColorStop(0, `rgba(255, 151, 65, ${0.62 * lightIntensity})`);
    glow.addColorStop(1, 'rgba(255, 151, 65, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(
      0,
      -height * 0.2,
      (22 + 12 * lightIntensity) * zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.restore();

  drawFlag(
    context,
    {
      x: point.x,
      y: point.y - height,
    },
    time,
    node.type === 'beacon' ? '#3d8d79' : '#579c83',
    0.72,
    29,
  );
};

const drawIsoTree = (
  context,
  point,
  { color = '#39765a', scale = 1, sway = 0 } = {},
) => {
  const zoom = camera.zoom;
  const trunkHeight = 20 * scale * zoom;
  const canopySize = 15 * scale * zoom;

  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = '#6d4d35';
  context.lineWidth = Math.max(1.2, 2.4 * zoom);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(sway, -trunkHeight);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(
    sway,
    -trunkHeight - canopySize * 0.25,
    canopySize * 0.78,
    canopySize,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = colorWithAlpha(color, 0.82);
  context.beginPath();
  context.ellipse(
    sway - canopySize * 0.42,
    -trunkHeight,
    canopySize * 0.56,
    canopySize * 0.72,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
};

const drawBuilding = (
  context,
  building,
  time,
  highlighted,
  showLabel = true,
) => {
  const point = toIsoPoint(building);
  const zoom = camera.zoom;
  const lightIntensity = getLightIntensity();
  const width = 62 * zoom;
  const depth = 28 * zoom;
  const height = 52 * zoom;

  context.save();
  context.translate(point.x, point.y);
  context.shadowColor = 'rgba(20, 34, 30, 0.22)';
  context.shadowBlur = 18 * zoom;
  context.shadowOffsetY = 10 * zoom;

  drawDiamond(context, { x: 0, y: 0 }, width * 1.2, depth * 1.2);
  context.fillStyle = colorWithAlpha(building.color, 0.25);
  context.fill();
  context.shadowColor = 'transparent';

  context.fillStyle = colorWithAlpha(building.color, 0.82);
  context.beginPath();
  context.moveTo(-width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(-width / 2, -height);
  context.closePath();
  context.fill();
  context.fillStyle = colorWithAlpha(building.color, 0.64);
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(width / 2, -height);
  context.closePath();
  context.fill();
  context.fillStyle = blendHex('#e9f0d6', '#ffd77c', lightIntensity);
  context.fillRect(-width * 0.22, -height * 0.78, width * 0.16, height * 0.22);
  context.fillRect(width * 0.08, -height * 0.78, width * 0.16, height * 0.22);
  context.fillStyle = '#4a352b';
  context.fillRect(-width * 0.08, -height * 0.34, width * 0.16, height * 0.34);
  context.fillStyle = '#6b4d39';
  context.fillRect(
    width * 0.16,
    -height - depth * 0.65,
    width * 0.12,
    height * 0.34,
  );
  context.fillStyle = 'rgba(255, 255, 255, 0.36)';
  context.fillRect(-width * 0.42, -height * 0.54, width * 0.07, height * 0.28);
  context.fillStyle = '#3b312a';
  context.beginPath();
  context.moveTo(-width * 0.64, -height);
  context.lineTo(0, -height - depth * 0.92);
  context.lineTo(width * 0.64, -height);
  context.lineTo(0, -height + depth * 0.78);
  context.closePath();
  context.fill();

  if (building.type === 'pavilion') {
    context.strokeStyle = '#e2cfad';
    context.lineWidth = 2 * zoom;
    context.beginPath();
    context.moveTo(-width * 0.42, -height * 0.38);
    context.lineTo(-width * 0.42, 1 * zoom);
    context.moveTo(width * 0.42, -height * 0.38);
    context.lineTo(width * 0.42, 1 * zoom);
    context.stroke();
  }

  if (highlighted) {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2.4 * camera.zoom;
    context.shadowColor = '#ffffff';
    context.shadowBlur = 14;
    context.beginPath();
    context.ellipse(
      0,
      depth * 0.16,
      width * 0.72,
      depth * 0.72,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.shadowColor = 'transparent';
  }

  if (lightIntensity > 0.02) {
    const glow = context.createRadialGradient(
      -width * 0.11,
      -height * 0.7,
      0,
      -width * 0.11,
      -height * 0.7,
      (24 + 18 * lightIntensity) * camera.zoom,
    );
    glow.addColorStop(0, `rgba(255, 221, 130, ${0.58 * lightIntensity})`);
    glow.addColorStop(1, 'rgba(255, 221, 130, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(
      -width * 0.11,
      -height * 0.7,
      (24 + 18 * lightIntensity) * camera.zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.restore();

  if (showLabel) {
    drawBuildingLabel(context, building, time);
  }
};

const drawEcoBuilding = (context, building, time, highlighted) => {
  const point = toIsoPoint(building);
  const zoom = camera.zoom;
  const lightIntensity = getLightIntensity();
  const width = 66 * zoom;
  const height = 44 * zoom;
  const bob = Math.sin(time * 0.0015 + building.x) * 0.8;

  context.save();
  context.translate(point.x, point.y + bob);
  context.shadowColor = highlighted
    ? 'rgba(222, 255, 241, 0.94)'
    : 'rgba(23, 55, 43, 0.25)';
  context.shadowBlur = highlighted ? 20 : 13;
  context.shadowOffsetY = 8 * zoom;

  context.fillStyle = 'rgba(30, 65, 50, 0.18)';
  context.beginPath();
  context.ellipse(0, 8 * zoom, width * 0.6, 20 * zoom, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = 'transparent';

  context.fillStyle = props.nightFactor > 0.5 ? '#d6e3df' : '#f9fdfb';
  context.beginPath();
  context.ellipse(
    0,
    -18 * zoom,
    width * 0.48,
    height * 0.72,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle =
    props.nightFactor > 0.5
      ? 'rgba(100, 163, 166, 0.84)'
      : 'rgba(129, 205, 202, 0.76)';
  context.beginPath();
  context.ellipse(
    0,
    -14 * zoom,
    width * 0.37,
    height * 0.52,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = 'rgba(64, 121, 91, 0.78)';
  context.beginPath();
  context.ellipse(
    -14 * zoom,
    -43 * zoom,
    28 * zoom,
    9 * zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.ellipse(
    24 * zoom,
    -34 * zoom,
    18 * zoom,
    7 * zoom,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  context.lineWidth = 2 * zoom;
  context.beginPath();
  context.arc(0, -25 * zoom, width * 0.42, Math.PI * 1.04, Math.PI * 1.96);
  context.stroke();

  if (lightIntensity > 0.02) {
    const glow = context.createRadialGradient(
      0,
      -18 * zoom,
      0,
      0,
      -18 * zoom,
      width * 0.8,
    );
    glow.addColorStop(0, `rgba(255, 229, 164, ${0.42 * lightIntensity})`);
    glow.addColorStop(1, 'rgba(255, 229, 164, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, -18 * zoom, width * 0.8, 0, Math.PI * 2);
    context.fill();
  }

  if (highlighted) {
    context.strokeStyle = '#dcfff0';
    context.lineWidth = 2.5 * zoom;
    context.beginPath();
    context.ellipse(
      0,
      -18 * zoom,
      width * 0.55,
      height * 0.82,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  context.restore();
};

const drawResidentialHouse = (context, home, time, highlighted) => {
  const position = getPlotWorldPosition(home);
  const point = toIsoPoint(position);
  const zoom = camera.zoom;
  const lightIntensity = getLightIntensity();
  const variant = home.number % 4;
  const orientation = plotPositionMap.get(home.number)?.orientation ?? 0;
  const palettes = [
    {
      wall: '#9a7956',
      side: '#735640',
      roof: '#3f5351',
    },
    {
      wall: '#96978c',
      side: '#70736a',
      roof: '#354b4a',
    },
    {
      wall: '#ad6b5a',
      side: '#854d43',
      roof: '#4b3f3b',
    },
    {
      wall: '#7f9891',
      side: '#5e756f',
      roof: '#314845',
    },
  ];
  const palette = palettes[variant];
  const width = (variant === 3 ? 54 : 48) * zoom;
  const depth = 21 * zoom;
  const height = (variant === 3 ? 42 : 46) * zoom;
  const doorOffset = [width * 0.12, -width * 0.12, width * 0.04, -width * 0.04][
    orientation
  ];
  const windowShift = [
    width * 0.02,
    -width * 0.02,
    -width * 0.01,
    width * 0.01,
  ][orientation];
  const bob = Math.sin(time * 0.0016 + home.number) * 0.8;

  context.save();
  context.translate(point.x, point.y + bob);
  context.shadowColor = highlighted
    ? 'rgba(255, 246, 195, 0.9)'
    : 'rgba(25, 42, 35, 0.24)';
  context.shadowBlur = highlighted ? 18 : 12;
  context.shadowOffsetY = 6 * zoom;

  drawDiamond(context, { x: 0, y: 2 * zoom }, width * 1.28, depth * 1.45);
  context.fillStyle = 'rgba(46, 68, 55, 0.16)';
  context.fill();
  context.shadowColor = 'transparent';

  context.fillStyle = palette.side;
  context.beginPath();
  context.moveTo(-width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(-width / 2, -height);
  context.closePath();
  context.fill();

  context.fillStyle = palette.wall;
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(0, depth / 2);
  context.lineTo(0, depth / 2 - height);
  context.lineTo(width / 2, -height);
  context.closePath();
  context.fill();

  context.fillStyle = blendHex('#f0e4c8', '#ffd477', lightIntensity);
  context.fillRect(
    -width * 0.21 + windowShift,
    -height * 0.68,
    width * 0.15,
    height * 0.22,
  );
  context.fillRect(
    width * 0.07 + windowShift,
    -height * 0.68,
    width * 0.15,
    height * 0.22,
  );

  if (lightIntensity > 0.02) {
    const windowGlow = context.createRadialGradient(
      windowShift,
      -height * 0.58,
      0,
      windowShift,
      -height * 0.58,
      (18 + 13 * lightIntensity) * zoom,
    );
    windowGlow.addColorStop(0, `rgba(255, 217, 119, ${0.26 * lightIntensity})`);
    windowGlow.addColorStop(1, 'rgba(255, 217, 119, 0)');
    context.fillStyle = windowGlow;
    context.beginPath();
    context.arc(
      windowShift,
      -height * 0.58,
      (18 + 13 * lightIntensity) * zoom,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.fillStyle = '#50382d';
  context.fillRect(
    doorOffset - width * 0.06,
    -height * 0.3,
    width * 0.12,
    height * 0.3,
  );
  context.fillStyle = '#a59477';
  context.fillRect(
    width * 0.18,
    -height - depth * 0.72,
    width * 0.12,
    height * 0.34,
  );

  context.fillStyle = palette.roof;
  context.beginPath();
  context.moveTo(-width * 0.62, -height);
  context.lineTo(0, -height - depth * 1.18);
  context.lineTo(width * 0.62, -height);
  context.lineTo(0, -height + depth * 0.72);
  context.closePath();
  context.fill();

  if (variant === 3) {
    context.fillStyle = palette.side;
    context.fillRect(doorOffset, -height * 0.14, width * 0.42, depth * 0.42);
    context.strokeStyle = '#d6c19e';
    context.lineWidth = 1.4 * zoom;
    for (let index = 0; index < 5; index += 1) {
      const x = width * 0.08 + index * width * 0.09;
      context.beginPath();
      context.moveTo(x, -height * 0.14);
      context.lineTo(x, -height * 0.14 + depth * 0.42);
      context.stroke();
    }
  }

  if (home.items.some((item) => item.materialId === 'lamp-path')) {
    context.fillStyle = '#f6d476';
    context.beginPath();
    context.arc(width * 0.34, -height * 0.23, 3.2 * zoom, 0, Math.PI * 2);
    context.fill();
  }

  if (highlighted) {
    context.strokeStyle = '#fff3bc';
    context.lineWidth = 2.6 * zoom;
    context.shadowColor = '#fff1a6';
    context.shadowBlur = 16;
    context.beginPath();
    context.moveTo(-width * 0.66, -height);
    context.lineTo(0, -height - depth * 1.25);
    context.lineTo(width * 0.66, -height);
    context.lineTo(0, -height + depth * 0.8);
    context.closePath();
    context.stroke();
  }

  context.restore();
};

const drawResidentialPod = (context, home, time, highlighted) => {
  const position = getPlotWorldPosition(home);
  const point = toIsoPoint(position);
  const zoom = camera.zoom;
  const lightIntensity = getLightIntensity();
  const variant = home.number % 3;
  const width = (variant === 2 ? 58 : variant === 1 ? 50 : 42) * zoom;
  const height = (variant === 2 ? 31 : variant === 1 ? 27 : 23) * zoom;
  const bob = Math.sin(time * 0.0014 + home.number) * 0.6;

  context.save();
  context.translate(point.x, point.y + bob);
  context.shadowColor = highlighted
    ? 'rgba(208, 255, 235, 0.94)'
    : 'rgba(26, 55, 43, 0.24)';
  context.shadowBlur = highlighted ? 20 : 12;
  context.shadowOffsetY = 6 * zoom;

  context.fillStyle = 'rgba(35, 67, 53, 0.2)';
  context.beginPath();
  context.ellipse(0, 4 * zoom, width * 0.62, height * 0.42, 0, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = 'transparent';

  context.strokeStyle = 'rgba(224, 241, 233, 0.72)';
  context.lineWidth = 2 * zoom;
  context.beginPath();
  context.moveTo(-width * 0.34, 2 * zoom);
  context.lineTo(-width * 0.42, 20 * zoom);
  context.moveTo(width * 0.34, 2 * zoom);
  context.lineTo(width * 0.42, 20 * zoom);
  context.stroke();

  context.strokeStyle =
    props.nightFactor > 0.5
      ? 'rgba(150, 242, 232, 0.82)'
      : 'rgba(104, 176, 160, 0.58)';
  context.lineWidth = 1.6 * zoom;
  context.beginPath();
  context.ellipse(0, 20 * zoom, width * 0.48, height * 0.2, 0, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = props.nightFactor > 0.5 ? '#d8e5e1' : '#f8fcfa';
  context.beginPath();
  context.ellipse(
    0,
    -height * 0.28,
    width * 0.52,
    height * 0.72,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  const glass = context.createLinearGradient(
    -width * 0.4,
    -height,
    width * 0.4,
    0,
  );
  glass.addColorStop(
    0,
    props.nightFactor > 0.5
      ? 'rgba(116, 175, 178, 0.82)'
      : 'rgba(157, 219, 218, 0.76)',
  );
  glass.addColorStop(
    1,
    props.nightFactor > 0.5
      ? 'rgba(67, 118, 124, 0.88)'
      : 'rgba(91, 168, 170, 0.7)',
  );
  context.fillStyle = glass;
  context.beginPath();
  context.ellipse(
    0,
    -height * 0.28,
    width * 0.42,
    height * 0.56,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  context.lineWidth = 1.6 * zoom;
  context.beginPath();
  context.arc(0, -height * 0.34, width * 0.48, Math.PI * 1.08, Math.PI * 1.92);
  context.stroke();

  if (variant > 0) {
    context.fillStyle = 'rgba(76, 126, 102, 0.72)';
    context.beginPath();
    context.ellipse(
      -width * 0.22,
      -height * 0.72,
      width * 0.22,
      height * 0.16,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  if (variant === 2) {
    context.fillStyle = 'rgba(236, 245, 239, 0.82)';
    context.beginPath();
    context.ellipse(
      width * 0.48,
      2 * zoom,
      width * 0.22,
      height * 0.2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  if (lightIntensity > 0.02) {
    const glow = context.createRadialGradient(
      0,
      -height * 0.3,
      0,
      0,
      -height * 0.3,
      width * 0.75,
    );
    glow.addColorStop(0, `rgba(255, 229, 164, ${0.48 * lightIntensity})`);
    glow.addColorStop(1, 'rgba(255, 229, 164, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, -height * 0.3, width * 0.75, 0, Math.PI * 2);
    context.fill();
  }

  if (highlighted) {
    context.strokeStyle = '#d8ffef';
    context.lineWidth = 2.4 * zoom;
    context.shadowColor = '#bfffe1';
    context.shadowBlur = 14;
    context.beginPath();
    context.ellipse(
      0,
      -height * 0.28,
      width * 0.58,
      height * 0.8,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  context.restore();
};

const drawHomeItem = (context, item, plot, time, selected) => {
  const material = homeMaterialMap[item.materialId];
  const lightIntensity = getLightIntensity();

  if (!material) {
    return;
  }

  const point = toIsoPoint({
    x: plot.x + item.x,
    y: plot.y + item.y,
  });
  const zoom = camera.zoom;

  context.save();
  context.translate(point.x, point.y);
  context.rotate((item.rotation * Math.PI) / 180);

  if (material.shape === 'house') {
    const width = 38 * zoom;
    const height = 39 * zoom;
    context.fillStyle = material.color;
    context.beginPath();
    context.moveTo(-width / 2, 0);
    context.lineTo(0, width / 3);
    context.lineTo(0, width / 3 - height);
    context.lineTo(-width / 2, -height);
    context.closePath();
    context.fill();
    context.fillStyle = colorWithAlpha(material.color, 0.74);
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(0, width / 3);
    context.lineTo(0, width / 3 - height);
    context.lineTo(width / 2, -height);
    context.closePath();
    context.fill();
    context.fillStyle = material.roofColor;
    context.beginPath();
    context.moveTo(-width * 0.64, -height);
    context.lineTo(0, -height - width * 0.42);
    context.lineTo(width * 0.64, -height);
    context.lineTo(0, -height + width * 0.24);
    context.closePath();
    context.fill();
    context.fillStyle = blendHex('#f3dfb9', '#ffd77c', lightIntensity);
    context.fillRect(-3 * zoom, -height * 0.72, 5 * zoom, 7 * zoom);
  } else if (material.shape === 'tree') {
    drawIsoTree(
      context,
      { x: 0, y: 0 },
      {
        color: material.color,
        scale: 0.78,
        sway: Math.sin(time * 0.002 + item.x * 5) * 2,
      },
    );
  } else if (material.shape === 'flower') {
    context.strokeStyle = '#4f7b4f';
    context.lineWidth = 1.4 * zoom;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -10 * zoom);
    context.stroke();
    context.fillStyle = material.color;
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5;
      context.beginPath();
      context.arc(
        Math.cos(angle) * 4 * zoom,
        -10 * zoom + Math.sin(angle) * 4 * zoom,
        2.7 * zoom,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else if (material.shape === 'fence') {
    context.strokeStyle = material.color;
    context.lineWidth = 2.4 * zoom;
    context.beginPath();
    context.moveTo(-16 * zoom, -2 * zoom);
    context.lineTo(16 * zoom, -2 * zoom);
    context.moveTo(-12 * zoom, 1 * zoom);
    context.lineTo(-12 * zoom, -12 * zoom);
    context.moveTo(12 * zoom, 1 * zoom);
    context.lineTo(12 * zoom, -12 * zoom);
    context.stroke();
  } else if (material.shape === 'bench') {
    context.fillStyle = material.color;
    context.fillRect(-10 * zoom, -7 * zoom, 20 * zoom, 5 * zoom);
    context.fillRect(-8 * zoom, -3 * zoom, 3 * zoom, 6 * zoom);
    context.fillRect(5 * zoom, -3 * zoom, 3 * zoom, 6 * zoom);
  } else if (material.shape === 'table') {
    context.fillStyle = material.color;
    context.beginPath();
    context.ellipse(0, -7 * zoom, 10 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(-1.5 * zoom, -6 * zoom, 3 * zoom, 8 * zoom);
  } else if (material.shape === 'lamp') {
    context.strokeStyle = material.color;
    context.lineWidth = 2.2 * zoom;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -16 * zoom);
    context.stroke();
    context.fillStyle = material.glowColor;
    context.beginPath();
    context.arc(0, -18 * zoom, 3.5 * zoom, 0, Math.PI * 2);
    context.fill();

    if (lightIntensity > 0.02) {
      const glow = context.createRadialGradient(
        0,
        -18 * zoom,
        0,
        0,
        -18 * zoom,
        (18 + 10 * lightIntensity) * zoom,
      );
      glow.addColorStop(
        0,
        colorWithAlpha(material.glowColor, 0.62 * lightIntensity),
      );
      glow.addColorStop(1, colorWithAlpha(material.glowColor, 0));
      context.fillStyle = glow;
      context.beginPath();
      context.arc(
        0,
        -18 * zoom,
        (18 + 10 * lightIntensity) * zoom,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else if (material.shape === 'fountain') {
    context.fillStyle = material.color;
    context.beginPath();
    context.ellipse(0, -3 * zoom, 10 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    context.lineWidth = 1.2 * zoom;
    context.beginPath();
    context.moveTo(0, -5 * zoom);
    context.quadraticCurveTo(
      Math.sin(time * 0.004) * 5 * zoom,
      -22 * zoom,
      0,
      -8 * zoom,
    );
    context.stroke();
  } else {
    context.fillStyle = material.color;
    context.fillRect(-6 * zoom, -8 * zoom, 12 * zoom, 8 * zoom);
    context.fillRect(-1 * zoom, -13 * zoom, 2 * zoom, 5 * zoom);
  }

  if (selected) {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2 * camera.zoom;
    context.shadowColor = '#ffffff';
    context.shadowBlur = 9;
    context.beginPath();
    context.ellipse(0, -3 * zoom, 18 * zoom, 10 * zoom, 0, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
};

const drawHomePlot = (context, home, time, highlighted, showLabel = true) => {
  const position = getPlotWorldPosition(home);
  const dimensions = getPlotDimensions(home);
  const polygon = createIsoDiamond({
    x: position.x,
    y: position.y,
    ...dimensions,
    camera,
    viewport,
  });
  const selected = props.selectedPlotId === home.id;
  const canEdit = worldStore.canEditHome(home.id);
  const isPrivate = home.visibility === 'private';
  const baseColor =
    home.ownerId === null
      ? 'rgba(212, 219, 214, 0.78)'
      : isPrivate && !canEdit
        ? 'rgba(114, 124, 119, 0.72)'
        : canEdit
          ? 'rgba(222, 146, 116, 0.68)'
          : 'rgba(180, 205, 190, 0.72)';

  drawPolygon(
    context,
    polygon,
    selected
      ? 'rgba(255, 218, 125, 0.92)'
      : highlighted
        ? 'rgba(255, 241, 184, 0.94)'
        : baseColor,
    selected || highlighted ? '#ffffff' : 'rgba(53, 78, 66, 0.45)',
    selected || highlighted ? 2.4 : 1,
  );

  context.save();
  context.strokeStyle = props.nightFactor > 0.5 ? '#8d806d' : '#876f50';
  context.lineWidth = 1.8 * camera.zoom;

  for (let index = 0; index < polygon.length; index += 1) {
    if (index === 2) {
      continue;
    }

    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  const gateStart = polygon[2];
  const gateEnd = polygon[3];
  context.strokeStyle = props.nightFactor > 0.5 ? '#d0ad68' : '#a17c48';
  context.lineWidth = 3 * camera.zoom;
  context.beginPath();
  context.moveTo(
    gateStart.x + (gateEnd.x - gateStart.x) * 0.36,
    gateStart.y + (gateEnd.y - gateStart.y) * 0.36,
  );
  context.lineTo(
    gateStart.x + (gateEnd.x - gateStart.x) * 0.64,
    gateStart.y + (gateEnd.y - gateStart.y) * 0.64,
  );
  context.stroke();
  context.restore();

  if (showLabel) {
    drawHomePlotLabel(context, center, home);
  }

  const placedHouse = home.items.find(
    (item) => homeMaterialMap[item.materialId]?.shape === 'house',
  );
  const showInterior = home.visibility !== 'private' || canEdit;

  if (home.ownerId && !placedHouse) {
    drawResidentialPod(context, home, time, highlighted || selected);
  }

  if (showInterior) {
    for (const item of home.items.filter(
      (candidate) => homeMaterialMap[candidate.materialId]?.shape !== 'house',
    )) {
      drawHomeItem(
        context,
        item,
        {
          ...home,
          x: position.x,
          y: position.y,
        },
        time,
        props.selectedItemId === item.id,
      );
    }
  } else if (placedHouse) {
    drawResidentialPod(context, home, time, highlighted || selected);
  }

  if (home.hiddenClue && props.nightFactor < 0.42) {
    const cluePoint = toIsoPoint({
      x: position.x + 0.28,
      y: position.y - 0.22,
    });
    context.fillStyle = 'rgba(255, 218, 125, 0.78)';
    context.beginPath();
    context.arc(cluePoint.x, cluePoint.y, 2.2 * camera.zoom, 0, Math.PI * 2);
    context.fill();
  }
};

const drawBuildingLabel = (context, building, time) => {
  const point = toIsoPoint(building);
  const zoom = camera.zoom;
  const bob = Math.sin(time * 0.0018 + building.x) * 1.3;
  context.save();
  context.font = `700 ${Math.max(11, 12 * zoom)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(20, 28, 24, 0.5)';
  context.strokeText(building.name, point.x, point.y + 45 * zoom + bob);
  context.fillStyle = 'rgba(255, 255, 255, 0.94)';
  context.fillText(building.name, point.x, point.y + 45 * zoom + bob);
  context.restore();
};

const drawHomePlotLabel = (context, center, home) => {
  const label = home.ownerId ? home.ownerName : `地块 ${home.number}`;
  context.save();
  context.font = `700 ${Math.max(9, 10 * camera.zoom)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 3.5;
  context.strokeStyle = 'rgba(20, 28, 24, 0.42)';
  context.strokeText(label, center.x, center.y + 22 * camera.zoom);
  context.fillStyle = 'rgba(248, 244, 232, 0.92)';
  context.fillText(label, center.x, center.y + 22 * camera.zoom);
  context.restore();
};

const drawTrainingGroundLabel = (context) => {
  const center = toIsoPoint(trainingGround);
  const zoom = camera.zoom;
  context.save();
  context.font = `700 ${Math.max(10, 11 * zoom)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(20, 28, 24, 0.5)';
  context.strokeText(trainingGround.label, center.x, center.y + 36 * zoom);
  context.fillStyle = 'rgba(255, 250, 232, 0.96)';
  context.fillText(trainingGround.label, center.x, center.y + 36 * zoom);
  context.restore();
};

const drawCentralPlazaLabel = (context) => {
  const plaza = plazaWorldPoints.find((item) => item.id === 'plaza-central');
  const center = toIsoPoint({
    x: plaza.x,
    y: plaza.y,
  });
  const zoom = camera.zoom;
  context.save();
  context.font = `700 ${Math.max(11, 12 * zoom)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(23, 47, 38, 0.52)';
  context.strokeText(plaza.label, center.x, center.y + 52 * zoom);
  context.fillStyle = 'rgba(250, 255, 251, 0.98)';
  context.fillText(plaza.label, center.x, center.y + 52 * zoom);
  context.restore();
};

const getBuildingAt = (point) =>
  [...publicBuildings].reverse().find((building) => {
    const screen = toIsoPoint(building);
    const radius = 48 * camera.zoom;

    return (
      Math.abs(point.x - screen.x) < radius &&
      point.y > screen.y - radius * 1.35 &&
      point.y < screen.y + radius * 0.95
    );
  }) || null;

const getLandmarkAt = (point) => {
  const centralPlazaPolygon = centralPlazaWorldPolygon.map(toIsoPoint);

  if (pointInPolygon(point, centralPlazaPolygon)) {
    return {
      id: 'plaza-central',
      label: '生活广场',
      detail: '社区活动、生活任务、休闲聚会与公共服务核心',
      type: 'plaza',
    };
  }

  const trainingPolygon = createIsoDiamond({
    x: trainingGround.x,
    y: trainingGround.y,
    halfWidth: trainingGround.halfWidth,
    halfHeight: trainingGround.halfHeight,
    camera,
    viewport,
  });

  if (pointInPolygon(point, trainingPolygon)) {
    return trainingGround;
  }

  return (
    defenseNodes.find((node) => {
      const screen = toIsoPoint(node);
      const radius = 28 * camera.zoom;

      return (
        Math.abs(point.x - screen.x) < radius &&
        point.y > screen.y - radius * 1.6 &&
        point.y < screen.y + radius * 0.8
      );
    }) || null
  );
};

const getPlotAt = (point) =>
  [...worldStore.state.homes].reverse().find((home) => {
    const position = getPlotWorldPosition(home);
    const dimensions = getPlotDimensions(home);

    return pointInPolygon(
      point,
      createIsoDiamond({
        x: position.x,
        y: position.y,
        ...dimensions,
        camera,
        viewport,
      }),
    );
  }) || null;

const getRoadNodeAt = (point) =>
  roadNodes.find((node) => {
    const screen = toIsoPoint(node);
    const radius = 22 * camera.zoom;

    return (
      Math.abs(point.x - screen.x) < radius &&
      Math.abs(point.y - screen.y) < radius * 0.72
    );
  }) || null;

const getItemAt = (point, plotId) => {
  const home = worldStore.getHomePlot(plotId);

  if (!home) {
    return null;
  }

  return (
    [...home.items].reverse().find((item) => {
      const position = getPlotWorldPosition(home);
      const screen = toIsoPoint({
        x: position.x + item.x,
        y: position.y + item.y,
      });
      const radius = 18 * camera.zoom;

      return (
        Math.abs(point.x - screen.x) < radius &&
        point.y > screen.y - 34 * camera.zoom &&
        point.y < screen.y + 12 * camera.zoom
      );
    }) || null
  );
};

const getCanvasPoint = (event) => {
  const bounds = canvasRef.value.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
};

const updateHover = (event) => {
  const point = getCanvasPoint(event);
  pointer.x = point.x;
  pointer.y = point.y;
  pointer.inside =
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= viewport.width &&
    point.y <= viewport.height;

  const building = getBuildingAt(point);

  if (building) {
    hover.value = {
      type: 'building',
      id: building.id,
      label: building.name,
      detail: '点击进入场景',
      accent: building.color,
      x: point.x,
      y: point.y,
    };
    return;
  }

  const landmark = getLandmarkAt(point);

  if (landmark) {
    hover.value = {
      type: 'landmark',
      id: landmark.id,
      label: landmark.label,
      detail:
        landmark.id === 'training-ground'
          ? '点击查看社区花园信息'
          : landmark.type === 'plaza'
            ? '点击查看生活广场信息'
            : '点击查看防御节点',
      accent:
        landmark.type === 'beacon'
          ? '#d56d3f'
          : landmark.id === 'training-ground'
            ? '#a1763d'
            : '#b58b4c',
      x: point.x,
      y: point.y,
    };
    return;
  }

  const plot = getPlotAt(point);

  if (plot) {
    const isPrivate =
      plot.visibility === 'private' && !worldStore.canEditHome(plot.id);
    hover.value = {
      type: 'plot',
      id: plot.id,
      label: plot.ownerId ? plot.ownerName : '空闲家园地块',
      detail: isPrivate
        ? '私密家园 · 仅可查看外观'
        : worldStore.canEditHome(plot.id)
          ? `你的家园 · ${plot.items.length} 件陈设`
          : `${plot.visibility === 'public' ? '公开参观' : '私人领地'} · ${
              plot.items.length
            } 件陈设`,
      accent: plot.visibility === 'private' ? '#69756f' : '#4f806b',
      x: point.x,
      y: point.y,
    };
    return;
  }

  const roadNode = getRoadNodeAt(point);

  if (roadNode) {
    hover.value = {
      type: 'road',
      id: roadNode.id,
      label: roadNode.label,
      detail: '生态连廊 · 全员可通行',
      accent: '#b39a72',
      x: point.x,
      y: point.y,
    };
    return;
  }

  hover.value = null;
};

const draw = (time) => {
  const canvas = canvasRef.value;
  const context = getCanvasContext();

  if (!canvas || !context) {
    return;
  }

  const width = viewport.width;
  const height = viewport.height;
  const dpr = window.devicePixelRatio || 1;

  if (
    canvas.width !== Math.round(width * dpr) ||
    canvas.height !== Math.round(height * dpr)
  ) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const sky = context.createLinearGradient(0, 0, 0, height);

  if (props.nightFactor > 0.5) {
    sky.addColorStop(0, '#14233f');
    sky.addColorStop(0.62, '#263a50');
    sky.addColorStop(1, '#4e5f63');
  } else {
    sky.addColorStop(0, '#b9d8dc');
    sky.addColorStop(0.65, '#e7eee5');
    sky.addColorStop(1, '#c9d5c6');
  }

  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  if (props.nightFactor > 0.38) {
    context.fillStyle = `rgba(255, 255, 255, ${
      (props.nightFactor - 0.38) * 0.75
    })`;

    for (let index = 0; index < 48; index += 1) {
      const x = ((index * 137) % width) + Math.sin(time * 0.0002 + index) * 2;
      const y = ((index * 73) % Math.max(210, height * 0.42)) + 22;
      context.fillRect(x, y, index % 4 === 0 ? 2 : 1, index % 4 === 0 ? 2 : 1);
    }
  }

  drawMountainLayer(
    context,
    time,
    0.08,
    height * 0.36,
    props.nightFactor > 0.5
      ? 'rgba(67, 82, 91, 0.68)'
      : 'rgba(123, 146, 132, 0.36)',
  );
  drawMountainLayer(
    context,
    time,
    0.18,
    height * 0.44,
    props.nightFactor > 0.5
      ? 'rgba(47, 67, 68, 0.78)'
      : 'rgba(86, 128, 105, 0.5)',
  );
  drawClouds(context, time);

  const cityGroundDepth = cityGroundWorldPolygon
    .map(toIsoPoint)
    .map((point) => ({
      x: point.x,
      y: point.y + 24 * camera.zoom,
    }));
  drawPolygon(
    context,
    cityGroundDepth,
    props.nightFactor > 0.5 ? '#172c26' : '#365443',
    null,
  );

  for (const tree of forestTrees.filter((candidate) =>
    isSceneryPositionClear(candidate),
  )) {
    const point = toIsoPoint(tree);
    const sway =
      Math.sin(time * 0.0018 + tree.x * 2 + tree.y) * 2.2 * tree.size;
    drawIsoTree(context, point, {
      color: props.nightFactor > 0.5 ? '#2c5848' : '#427c59',
      scale: tree.size,
      sway,
    });
  }

  drawMoat(context, time);
  drawRoadNetwork(context, time);
  drawCentralPlaza(context, time);

  for (const roadNode of roadNodes) {
    const point = toIsoPoint(roadNode);
    const highlighted =
      hover.value?.type === 'road' && hover.value.id === roadNode.id;

    context.strokeStyle = highlighted
      ? 'rgba(213, 255, 237, 0.94)'
      : 'rgba(114, 159, 139, 0.38)';
    context.lineWidth = highlighted ? 2.2 * camera.zoom : 1 * camera.zoom;
    context.beginPath();
    context.ellipse(
      point.x,
      point.y,
      (highlighted ? 14 : 8) * camera.zoom,
      (highlighted ? 7 : 4) * camera.zoom,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  drawTrainingGround(context, time);

  const renderables = [
    ...homeLayoutResult.homes.map((layout) => ({
      type: 'home',
      depth: layout.x + layout.y,
      layout,
      home: worldStore.state.homes.find(
        (home) => home.number === layout.number,
      ),
    })),
    ...publicBuildings.map((building) => ({
      type: 'building',
      depth: building.x + building.y,
      building,
    })),
    ...defenseNodes.map((node) => ({
      type: 'defense',
      depth: node.x + node.y,
      node,
    })),
    ...[...roadDecorations, ...plazaDecorations, ...sceneryVegetation].map(
      (decoration) => ({
        type: 'decoration',
        depth: decoration.x + decoration.y,
        decoration,
      }),
    ),
  ].sort((left, right) => left.depth - right.depth);

  for (const renderable of renderables) {
    if (renderable.type === 'home') {
      drawHomePlot(
        context,
        renderable.home,
        time,
        hover.value?.type === 'plot' && hover.value.id === renderable.home.id,
        false,
      );
    } else if (renderable.type === 'building') {
      drawEcoBuilding(
        context,
        renderable.building,
        time,
        hover.value?.type === 'building' &&
          hover.value.id === renderable.building.id,
        false,
      );
    } else if (renderable.type === 'defense') {
      drawDefenseNode(context, renderable.node, time);
    } else if (renderable.type === 'gate') {
      drawGateHouse(context, renderable.gate, time);
    } else {
      drawRoadDecoration(context, renderable.decoration, time);
    }
  }

  for (const home of worldStore.state.homes) {
    const layout = plotPositionMap.get(home.number);

    if (layout) {
      drawHomePlotLabel(context, toIsoPoint(layout), home);
    }
  }

  for (const building of publicBuildings) {
    drawBuildingLabel(context, building, time);
  }

  drawTrainingGroundLabel(context);
  drawCentralPlazaLabel(context);

  const nightOverlay = context.createLinearGradient(0, 0, width, height);
  nightOverlay.addColorStop(0, `rgba(16, 31, 63, ${props.nightFactor * 0.28})`);
  nightOverlay.addColorStop(1, `rgba(12, 25, 45, ${props.nightFactor * 0.18})`);
  context.fillStyle = nightOverlay;
  context.fillRect(0, 0, width, height);
};

const animate = (time) => {
  draw(time);
  animationFrame = requestAnimationFrame(animate);
};

const resize = () => {
  if (!wrapperRef.value) {
    return;
  }

  const bounds = wrapperRef.value.getBoundingClientRect();
  viewport.width = Math.max(1, bounds.width);
  viewport.height = Math.max(1, bounds.height);
};

const resetView = () => {
  camera.panX = 0;
  camera.panY = 20;
  camera.zoom = 0.92;
};

const zoomBy = (factor, center) => {
  const anchor = center || {
    x: viewport.width / 2,
    y: viewport.height / 2,
  };
  const worldBefore = screenToWorld({
    ...anchor,
    camera,
    viewport,
  });

  camera.zoom = clamp(camera.zoom * factor, 0.52, 1.8);

  const worldAfter = screenToWorld({
    ...anchor,
    camera,
    viewport,
  });
  const beforePoint = worldToScreen({
    ...worldBefore,
    camera,
    viewport,
  });
  const afterPoint = worldToScreen({
    ...worldAfter,
    camera,
    viewport,
  });

  camera.panX += beforePoint.x - afterPoint.x;
  camera.panY += beforePoint.y - afterPoint.y;
};

const handleWheel = (event) => {
  event.preventDefault();
  zoomBy(event.deltaY > 0 ? 0.92 : 1.08, getCanvasPoint(event));
};

const beginPinch = () => {
  const points = [...activePointers.values()];

  if (points.length < 2) {
    return;
  }

  const [first, second] = points;
  interaction.pinchDistance = Math.hypot(
    second.x - first.x,
    second.y - first.y,
  );
  interaction.pinchZoom = camera.zoom;
  interaction.pinchMidX = (first.x + second.x) / 2;
  interaction.pinchMidY = (first.y + second.y) / 2;
  interaction.pinchPanX = camera.panX;
  interaction.pinchPanY = camera.panY;
};

const handlePointerDown = (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  const point = getCanvasPoint(event);
  canvasRef.value.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, point);
  interaction.moved = false;
  interaction.startX = point.x;
  interaction.startY = point.y;
  interaction.startPanX = camera.panX;
  interaction.startPanY = camera.panY;

  if (activePointers.size === 2) {
    interaction.dragging = false;
    interaction.itemId = null;
    beginPinch();
    return;
  }

  const item =
    props.editMode && props.selectedPlotId
      ? getItemAt(point, props.selectedPlotId)
      : null;

  if (item) {
    interaction.dragging = true;
    interaction.itemId = item.id;
    emit('select-item', item.id);
    return;
  }

  interaction.dragging = true;
};

const handlePointerMove = (event) => {
  const point = getCanvasPoint(event);

  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, point);
  }

  updateHover(event);

  if (activePointers.size >= 2) {
    const points = [...activePointers.values()];
    const [first, second] = points;
    const distance = Math.max(
      1,
      Math.hypot(second.x - first.x, second.y - first.y),
    );
    const middleX = (first.x + second.x) / 2;
    const middleY = (first.y + second.y) / 2;

    camera.zoom = clamp(
      interaction.pinchZoom *
        (distance / Math.max(1, interaction.pinchDistance)),
      0.52,
      1.8,
    );
    camera.panX = interaction.pinchPanX + (middleX - interaction.pinchMidX);
    camera.panY = interaction.pinchPanY + (middleY - interaction.pinchMidY);
    interaction.moved = true;
    return;
  }

  if (!interaction.dragging) {
    return;
  }

  const deltaX = point.x - interaction.startX;
  const deltaY = point.y - interaction.startY;

  if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
    interaction.moved = true;
  }

  if (interaction.itemId) {
    const home = worldStore.getHomePlot(props.selectedPlotId);
    const world = screenToWorld({
      ...point,
      camera,
      viewport,
    });

    if (home) {
      const position = getPlotWorldPosition(home);
      emit('move-item', {
        itemId: interaction.itemId,
        x: clamp(world.x - position.x, -0.38, 0.38),
        y: clamp(world.y - position.y, -0.32, 0.32),
      });
    }
    return;
  }

  camera.panX = interaction.startPanX + deltaX;
  camera.panY = interaction.startPanY + deltaY;
};

const handlePointerUp = (event) => {
  const point = getCanvasPoint(event);
  activePointers.delete(event.pointerId);

  if (activePointers.size < 2) {
    interaction.pinchDistance = 0;
  }

  if (interaction.dragging && !interaction.moved && !interaction.itemId) {
    const building = getBuildingAt(point);

    if (building) {
      emit('select-building', building.sceneId);
      interaction.dragging = false;
      return;
    }

    const landmark = getLandmarkAt(point);

    if (landmark) {
      selectedLandmark.value = landmark;
      interaction.dragging = false;
      return;
    }

    const plot = getPlotAt(point);

    if (plot) {
      if (
        props.editMode &&
        props.selectedMaterialId &&
        worldStore.canEditHome(plot.id)
      ) {
        const world = screenToWorld({
          ...point,
          camera,
          viewport,
        });
        const position = getPlotWorldPosition(plot);
        emit('place-material', {
          plotId: plot.id,
          materialId: props.selectedMaterialId,
          x: clamp(world.x - position.x, -0.36, 0.36),
          y: clamp(world.y - position.y, -0.3, 0.3),
        });
      } else {
        emit('select-plot', plot.id);
      }
    } else {
      selectedLandmark.value = null;
      emit('clear-selection');
    }
  }

  interaction.dragging = false;
  interaction.itemId = null;
};

const handleDrop = (event) => {
  event.preventDefault();
  const materialId = event.dataTransfer?.getData(
    'application/x-utopia-material',
  );

  if (!materialId || !props.selectedPlotId) {
    return;
  }

  const home = worldStore.getHomePlot(props.selectedPlotId);

  if (!home || !worldStore.canEditHome(home.id)) {
    return;
  }

  const point = getCanvasPoint(event);
  const world = screenToWorld({
    ...point,
    camera,
    viewport,
  });
  const position = getPlotWorldPosition(home);

  emit('place-material', {
    plotId: home.id,
    materialId,
    x: clamp(world.x - position.x, -0.36, 0.36),
    y: clamp(world.y - position.y, -0.3, 0.3),
  });
};

const tooltipStyle = computed(() => ({
  left: `${pointer.x + 16}px`,
  top: `${pointer.y + 16}px`,
}));

watch(
  () => props.nightFactor,
  () => {},
);

onMounted(() => {
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(wrapperRef.value);
  resize();
  animationFrame = requestAnimationFrame(animate);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
});

defineExpose({
  resetView,
  zoomIn: () => zoomBy(1.12),
  zoomOut: () => zoomBy(0.88),
});
</script>

<template>
  <div
    ref="wrapperRef"
    class="vu-canvas-wrapper"
    :data-night-factor="nightFactor.toFixed(2)"
    :data-layout-valid="homeLayoutResult.validation.valid"
    :data-layout-overlaps="homeLayoutResult.validation.overlapping.length"
    :data-layout-out-of-bounds="homeLayoutResult.validation.outOfBounds.length"
    :data-layout-home-count="homeLayoutResult.homes.length"
    :class="{
      'is-dragging': interaction.dragging,
      'is-editing': editMode,
    }"
  >
    <canvas
      ref="canvasRef"
      class="vu-isometric-canvas"
      aria-label="虚拟乌托邦等轴测大陆地图"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
      @pointerleave="pointer.inside = false"
      @wheel="handleWheel"
      @dragover.prevent
      @drop="handleDrop"
    />

    <div
      v-if="hover && pointer.inside"
      class="vu-canvas-tooltip"
      :style="{
        ...tooltipStyle,
        '--tooltip-accent': hover.accent || '#d6b875',
      }"
    >
      <i aria-hidden="true" />
      <strong>{{ hover.label }}</strong>
      <span>{{ hover.detail }}</span>
    </div>

    <article
      v-if="selectedLandmark"
      class="vu-canvas-info-card"
      :class="`vu-canvas-info-card--${selectedLandmark.type}`"
    >
      <button
        type="button"
        aria-label="关闭地图信息"
        @click="selectedLandmark = null"
      >
        ×
      </button>
      <span class="vu-kicker">
        {{
          selectedLandmark.type === 'plaza'
            ? 'LIFE PLAZA'
            : selectedLandmark.id === 'training-ground'
              ? 'COMMUNITY GARDEN'
              : 'ECO OBSERVATORY'
        }}
      </span>
      <h2>{{ selectedLandmark.label }}</h2>
      <p>{{ selectedLandmark.detail }}</p>
      <dl
        v-if="
          selectedLandmark.type === 'arrowtower' ||
          selectedLandmark.type === 'beacon'
        "
      >
        <div>
          <dt>节点类型</dt>
          <dd>
            {{
              {
                arrowtower: '生态观测站',
                beacon: '森林信号塔',
              }[selectedLandmark.type] || '生态设施'
            }}
          </dd>
        </div>
        <div>
          <dt>运行状态</dt>
          <dd>已接入生态监测网络</dd>
        </div>
      </dl>
      <div v-else class="vu-training-tags">
        <span>社区活动</span>
        <span>生活任务</span>
        <span>休闲聚会</span>
      </div>
    </article>
  </div>
</template>
