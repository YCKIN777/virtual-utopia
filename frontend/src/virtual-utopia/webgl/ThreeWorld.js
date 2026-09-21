import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadWorldModels } from './modelLoader.js';
import { seedResidents } from '../data/residents.js';
import {
  bridgeNetwork,
  crossGroupBridges,
  getHomeById,
  getNearestHub,
  getTerrainHeight,
  homes,
} from './worldLayout.js';

const WOOD = '#9b7547';
const WOOD_DARK = '#694d32';
const LEAF = '#2f704c';

// 原住民 plotId -> 户主名（用于屋顶灯笼木牌署名）
const RESIDENT_PLOTS = Object.fromEntries(
  seedResidents.map((resident) => [resident.homePlotId, resident.residentName]),
);

// 屋顶暖黄小灯笼（柔光、不刺眼）：白天是普通小灯笼不发光，傍晚/夜间随 nightBlend 自动亮起
const LANTERN_DAY = '#caa063'; // 白天未点亮时纸灯笼的暗暖色
const LANTERN_WARM = '#ffd591'; // 夜晚点亮时提亮的暖芯色
const LANTERN_LIGHT = '#ffb24d'; // 灯笼点光源暖色
const LANTERN_HALO = '#ffcf8f'; // 柔光晕色
const LANTERN_DAY_COLOR = new THREE.Color(LANTERN_DAY);
const LANTERN_WARM_COLOR = new THREE.Color(LANTERN_WARM);

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const getStreamX = (z) => Math.sin(z * 0.075) * 9;

const getStreamWidth = (z) =>
  1.45 +
  (0.5 + 0.5 * Math.sin(z * 0.087)) * 1.2 +
  (0.5 + 0.5 * Math.sin(z * 0.021 + 1.7)) * 0.85;

const getStreamPoint = (z) => {
  const x = getStreamX(z);
  return new THREE.Vector3(x, getTerrainHeight(x, z) + 0.48, z);
};

const createStreamRibbon = ({
  widthScale = 1,
  heightOffset = 0,
  colorAt = () => new THREE.Color('#5f9f9a'),
  sampleStep = 2.2,
}) => {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const samples = [];

  for (let z = -172; z <= 172; z += sampleStep) {
    samples.push(z);
  }

  samples.forEach((z, index) => {
    const width = getStreamWidth(z) * widthScale;
    const centerX = getStreamX(z);
    const tangentZ = 1;
    const tangentX = (getStreamX(z + 0.5) - getStreamX(z - 0.5)) / 1;
    const length = Math.hypot(tangentX, tangentZ);
    const normalX = -tangentZ / length;
    const normalZ = tangentX / length;
    const color = colorAt(z, index);

    for (const side of [-1, 1]) {
      const x = centerX + normalX * width * side;
      const vertexZ = z + normalZ * width * side;
      const y = getTerrainHeight(x, vertexZ) + 0.48 + heightOffset;
      positions.push(x, y, vertexZ);
      colors.push(color.r, color.g, color.b);
      uvs.push(index / (samples.length - 1), side === -1 ? 0 : 1);
    }
  });

  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = index * 2;
    const next = current + 2;
    indices.push(current, current + 1, next, current + 1, next + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createTerrainBandGeometry = ({
  innerRadius,
  outerRadius,
  segments = 96,
  heightOffset = 0.04,
}) => {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const radius of [innerRadius, outerRadius]) {
      const x = cos * radius;
      const z = sin * radius;
      positions.push(x, getTerrainHeight(x, z) + heightOffset, z);
      uvs.push(
        (radius - innerRadius) / (outerRadius - innerRadius),
        index / segments,
      );
    }
  }

  for (let index = 0; index < segments; index += 1) {
    const current = index * 2;
    const next = current + 2;
    indices.push(current, current + 1, next, current + 1, next + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const waitFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const createWoodMaterial = (color = WOOD) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.02,
  });

const createManorProxy = (home) => {
  const proxy = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color:
      home.group === 'forest'
        ? '#7d5836'
        : home.group === 'cliff'
          ? '#9b6d40'
          : '#a97a47',
    roughness: 0.88,
  });
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.7, 2.3),
    wallMaterial,
  );
  wall.position.y = 1.15;
  proxy.add(wall);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.75, 1.15, 4, 1),
    createWoodMaterial('#5e422d'),
  );
  roof.position.y = 2.55;
  roof.rotation.y = Math.PI / 4;
  proxy.add(roof);

  const garden = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 8, 6),
    new THREE.MeshStandardMaterial({
      color: '#3d7548',
      roughness: 1,
    }),
  );
  garden.scale.set(1.2, 0.22, 0.9);
  garden.position.set(-0.2, 2.55, -0.2);
  proxy.add(garden);

  return proxy;
};

const avatarColors = [
  '#d76d5e',
  '#4f8f7b',
  '#d09a45',
  '#6478b8',
  '#9b6cbb',
  '#5aa0b5',
];

const getAvatarColor = (userId) => {
  const numericId = Number(userId) || 0;
  return avatarColors[Math.abs(numericId) % avatarColors.length];
};

const createAvatarLabel = (displayName, color) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(20, 40, 36, 0.78)';
  context.roundRect(4, 4, 248, 56, 18);
  context.fill();
  context.fillStyle = color;
  context.beginPath();
  context.arc(30, 32, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '600 24px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(displayName, 142, 33, 190);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 1.95;
  return sprite;
};

// 山林庄园风格的木牌文字标签：始终朝向镜头，固定锚定在世界坐标，不随镜头漂移。
const createWoodSignSprite = (text) => {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const context = canvas.getContext('2d');

  // 木牌底板（带圆角与木纹）
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#b8814a');
  gradient.addColorStop(0.5, '#956233');
  gradient.addColorStop(1, '#7c4f29');
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(10, 20, canvas.width - 20, canvas.height - 40, 24);
  context.fill();

  context.lineWidth = 7;
  context.strokeStyle = '#5d3b1f';
  context.stroke();

  context.strokeStyle = 'rgba(93, 59, 31, 0.35)';
  context.lineWidth = 2;
  for (const offset of [-28, 0, 28]) {
    const y = canvas.height / 2 + offset;
    context.beginPath();
    context.moveTo(26, y);
    context.bezierCurveTo(
      canvas.width * 0.35,
      y - 6,
      canvas.width * 0.65,
      y + 6,
      canvas.width - 26,
      y,
    );
    context.stroke();
  }

  // 户主名（奶油色，带描边提升远处可读性）
  context.font =
    '700 62px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(36, 20, 8, 0.6)';
  context.shadowBlur = 5;
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(36, 20, 8, 0.7)';
  context.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);
  context.shadowBlur = 0;
  context.fillStyle = '#fff3da';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  sprite.renderOrder = 999;
  sprite.scale.set(3.8, 1.58, 1);
  return sprite;
};

// 生成一张白色径向渐变贴图（中心不透明→边缘透明），用于灯笼柔光晕，颜色由材质 color 染色。
const createRadialSpriteTexture = (size = 128) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.32, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const createBeamBetween = (start, end, radius, material) => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 6),
    material,
  );
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  beam.castShadow = true;
  return beam;
};

const bakeGeometry = (mesh) => {
  const geometry = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
};

export class ThreeWorld {
  constructor(
    container,
    { onProgress = () => {}, onSelect = () => {}, onStats = () => {} } = {},
  ) {
    this.container = container;
    this.onProgress = onProgress;
    this.onSelect = onSelect;
    this.onStats = onStats;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d4e8e5');
    this.scene.fog = new THREE.Fog('#d8ece6', 158, 330);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
    this.camera.position.set(82, 82, 96);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, 1.5),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#b7d2cc');
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 11;
    this.controls.maxDistance = 330;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 2, 0);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerStart = null;
    this.clickableMeshes = [];
    this.homeObjects = new Map();
    this.residentBeacons = new Map();
    this._modelBoundsCache = {};
    this.clouds = [];
    this.leafPoints = null;
    this.leafVelocities = [];
    this.birds = [];
    this.streamRipples = [];
    this.waterMaterials = [];
    this.walkwayLights = [];
    this.plazaLights = [];
    this.corridorLights = [];
    this.interiorLights = [];
    this.plazaFireLight = null;
    this.reflectionDirty = true;
    this.reflectionFrame = 0;
    this.streamCubeCamera = null;
    this.keys = new Set();
    this.timeOfDay = 11;
    this.dayCycleSpeed = 0.06;
    this.autoDayCycle = true;
    this.dayTarget = 1;
    this.dayBlend = 1;
    this.stars = null;
    this.fireflies = null;
    this.weather = 0;
    this.weatherTimer = 0;
    this.weatherInterval = 60;
    this.autoWeather = true;
    this.rain = null;
    this.rainVelocities = [];
    this.terrainMaterial = null;
    this.plazaDeckMaterial = null;
    this.fogEnabled = true;
    this.windEnabled = true;
    this.interiorMode = false;
    this.overviewMode = false;
    this.selectedHomeId = '';
    this.flyAnimation = null;
    this.models = null;
    this.avatarObjects = new Map();
    this.localAvatarId = '';
    this.localAppearance = { bodyColor: '#345c53', hairColor: '#2b2620' };
    this.userHomeLight = null;
    this.terrain = null;
    this.animationFrame = 0;
    this.running = false;
    this.frameCount = 0;
    this.roamingAgents = new Set();
  }

  async init() {
    this.bindEvents();
    this.resize();
    this.addLights();
    this.updateProgress(0.05, '加载轻量模型');
    await waitFrame();
    this.models = await loadWorldModels();
    this.updateProgress(0.16, '生成山体峡谷');
    await waitFrame();
    this.buildTerrain();
    this.buildDistantMountains();
    this.updateProgress(0.34, '生成溪流与森林');
    await waitFrame();
    this.buildStream();
    this.buildSecondaryStreams();
    this.buildRiversideWalkways();
    this.buildStreamLandmarks();
    this.buildForest();
    this.updateProgress(0.54, '搭建中心木构广场');
    await waitFrame();
    this.buildCentralPlaza();
    this.updateProgress(0.7, '连接木构连廊');
    await waitFrame();
    this.buildBridgeNetwork();
    this.buildPlazaConnections();
    this.updateProgress(0.84, '放置 50 户生态庄园');
    await waitFrame();
    this.buildHomes();
    this.buildCourtyardDetails();
    this.buildStreamDetailPass();
    this.buildRoadDetailPass();
    this.buildHomeDetailPass();
    this.buildFoothillBuffer();
    this.buildClouds();
    this.buildAtmospherePass();
    this.buildNightSky();
    this.buildFireflies();
    this.buildRain();
    this.updateProgress(1, '庄园城镇已就绪');
    this.running = true;
    this.clock.start();
    this.animate();
  }

  bindEvents() {
    this.handleResize = () => this.resize();
    this.handleKeyDown = (event) => {
      this.keys.add(event.code);
    };
    this.handleKeyUp = (event) => {
      this.keys.delete(event.code);
    };
    this.handlePointerDown = (event) => {
      this.pointerStart = {
        x: event.clientX,
        y: event.clientY,
      };
    };
    this.handlePointerUp = (event) => {
      if (!this.pointerStart) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - this.pointerStart.x,
        event.clientY - this.pointerStart.y,
      );
      this.pointerStart = null;

      if (distance > 5) {
        return;
      }

      this.pick(event);
    };
    this.handlePointerMove = (event) => {
      this.pointer.x =
        (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
      this.pointer.y =
        -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
    };

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.addEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.renderer.domElement.addEventListener(
      'pointerup',
      this.handlePointerUp,
    );
    this.renderer.domElement.addEventListener(
      'pointermove',
      this.handlePointerMove,
    );
  }

  addLights() {
    this.hemisphere = new THREE.HemisphereLight('#fff0cf', '#5c7048', 2.55);
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight('#ffe0ae', 3.15);
    this.sun.position.set(64, 82, 46);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3.5;
    this.scene.add(this.sun);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun.target);

    this.fillLight = new THREE.DirectionalLight('#c4eee1', 0.72);
    this.fillLight.position.set(-58, 28, -38);
    this.scene.add(this.fillLight);
  }

  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(364, 364, 168, 168);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color('#3d6538');
    const mid = new THREE.Color('#668e4c');
    const high = new THREE.Color('#91a56a');
    const stream = new THREE.Color('#4f837b');

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const y = getTerrainHeight(x, z);
      positions.setY(index, y);

      const color = low.clone();
      const noise = clamp((y + 5) / 12, 0, 1);
      color.lerp(mid, noise);
      color.lerp(high, Math.max(0, y - 5) / 9);

      if (Math.abs(x - Math.sin(z * 0.075) * 9) < 3.4) {
        color.lerp(stream, 0.7);
      }

      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    this.terrainMaterial = material;
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  buildDistantMountains() {
    const materials = [
      new THREE.MeshStandardMaterial({
        color: '#415b47',
        roughness: 1,
      }),
      new THREE.MeshStandardMaterial({
        color: '#526b54',
        roughness: 1,
      }),
    ];

    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2 + 0.2;
      const radius = 148 + (index % 4) * 12;
      const height = 24 + (index % 5) * 5;
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(18 + (index % 4) * 5, height, 10),
        materials[index % 2],
      );
      mountain.position.set(
        Math.cos(angle) * radius,
        getTerrainHeight(Math.cos(angle) * radius, Math.sin(angle) * radius) +
          height / 2,
        Math.sin(angle) * radius,
      );
      mountain.rotation.y = angle;
      mountain.receiveShadow = true;
      this.scene.add(mountain);
    }
  }

  buildSecondaryStreams() {
    const streamMaterial = new THREE.MeshPhysicalMaterial({
      color: '#599b96',
      transparent: true,
      opacity: 0.62,
      roughness: 0.22,
      transmission: 0.1,
    });

    const streamPaths = [
      {
        x: (z) => -72 + Math.sin(z * 0.04) * 9,
        radius: 0.52,
      },
      {
        x: (z) => 76 + Math.cos(z * 0.035) * 8,
        radius: 0.42,
      },
    ];

    streamPaths.forEach(({ x, radius }) => {
      const points = [];

      for (let z = -158; z <= 158; z += 7) {
        const streamX = x(z);
        points.push(
          new THREE.Vector3(streamX, getTerrainHeight(streamX, z) + 0.28, z),
        );
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const stream = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 128, radius, 6, false),
        streamMaterial,
      );
      stream.receiveShadow = true;
      this.scene.add(stream);
    });
  }

  buildStream() {
    const outerSlopeGeometry = createStreamRibbon({
      widthScale: 3.4,
      heightOffset: 0.28,
      colorAt: () => new THREE.Color('#71895a'),
      sampleStep: 1.8,
    });
    const outerSlope = new THREE.Mesh(
      outerSlopeGeometry,
      new THREE.MeshStandardMaterial({
        color: '#71895a',
        vertexColors: true,
        roughness: 1,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    outerSlope.receiveShadow = true;
    this.scene.add(outerSlope);

    const softBankGeometry = createStreamRibbon({
      widthScale: 2.65,
      heightOffset: 0.2,
      colorAt: (z) =>
        new THREE.Color(Math.sin(z * 0.06) > 0 ? '#839960' : '#748a59'),
      sampleStep: 1.8,
    });
    const softBank = new THREE.Mesh(
      softBankGeometry,
      new THREE.MeshStandardMaterial({
        color: '#7c925c',
        vertexColors: true,
        roughness: 1,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    softBank.receiveShadow = true;
    this.scene.add(softBank);

    const outerBankGeometry = createStreamRibbon({
      widthScale: 2.28,
      heightOffset: 0.1,
      colorAt: () => new THREE.Color('#7a8d61'),
    });
    const outerBank = new THREE.Mesh(
      outerBankGeometry,
      new THREE.MeshStandardMaterial({
        color: '#7a8d61',
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    outerBank.receiveShadow = true;
    this.scene.add(outerBank);

    const bedGeometry = createStreamRibbon({
      widthScale: 1.12,
      heightOffset: -0.36,
      colorAt: (z) =>
        new THREE.Color(Math.sin(z * 0.09) > 0.2 ? '#a19373' : '#5c7164'),
    });
    const bed = new THREE.Mesh(
      bedGeometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    bed.receiveShadow = true;
    this.scene.add(bed);

    const bankGeometry = createStreamRibbon({
      widthScale: 1.82,
      heightOffset: 0.02,
      colorAt: () => new THREE.Color('#65775a'),
    });
    const wetBank = new THREE.Mesh(
      bankGeometry,
      new THREE.MeshStandardMaterial({
        color: '#65775a',
        vertexColors: true,
        roughness: 1,
      }),
    );
    wetBank.receiveShadow = true;
    this.scene.add(wetBank);

    const waterGeometry = createStreamRibbon({
      widthScale: 0.94,
      heightOffset: -0.01,
      colorAt: (z) =>
        new THREE.Color(Math.sin(z * 0.11) > 0.38 ? '#c9f2e9' : '#75c5c3'),
    });
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: '#a4e3dd',
      vertexColors: true,
      roughness: 0.07,
      metalness: 0.015,
      transmission: 0.22,
      transparent: true,
      opacity: 0.64,
      envMapIntensity: 0.18,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
    });
    waterMaterial.userData.waterUniform = {
      value: 0,
    };
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterTime = waterMaterial.userData.waterUniform;
      shader.vertexShader =
        'uniform float uWaterTime;\nvarying vec2 vWaterUv;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
          vec3 transformed = vec3(position);
          vWaterUv = uv;
          transformed.y +=
            sin(uv.x * 72.0 - uWaterTime * 2.35) * 0.075 +
            sin(uv.x * 151.0 + uv.y * 4.0 - uWaterTime * 3.1) * 0.032;
        `,
      );
      shader.fragmentShader =
        'uniform float uWaterTime;\nvarying vec2 vWaterUv;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
          #include <emissivemap_fragment>
          float flowWave =
            sin(vWaterUv.x * 115.0 - uWaterTime * 3.0) * 0.5 + 0.5;
          float glint =
            pow(
              0.5 + 0.5 * sin(
                vWaterUv.x * 220.0 -
                uWaterTime * 4.2 +
                vWaterUv.y * 8.0
              ),
              8.0
            );
          totalEmissiveRadiance +=
            vec3(0.28, 0.65, 0.61) * flowWave * 0.17 +
            vec3(0.38, 0.74, 0.7) * glint * 0.08;
        `,
      );
    };
    this.streamSurface = new THREE.Mesh(waterGeometry, waterMaterial);
    this.streamSurface.receiveShadow = true;
    this.waterMaterials.push(waterMaterial);
    this.scene.add(this.streamSurface);

    const cubeTarget = new THREE.WebGLCubeRenderTarget(128, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.streamCubeCamera = new THREE.CubeCamera(1, 320, cubeTarget);
    this.streamCubeCamera.position.set(0, 8, 0);
    this.scene.add(this.streamCubeCamera);
    waterMaterial.envMap = cubeTarget.texture;

    this.buildRiverBanks();
    this.buildWaterRipples();
    this.buildWaterfalls();
  }

  buildRiverBanks() {
    let seed = 71129;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const rockGeometry = new THREE.IcosahedronGeometry(0.48, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: '#85877d',
      roughness: 0.98,
    });
    const rockCount = 112;
    const rocks = new THREE.InstancedMesh(
      rockGeometry,
      rockMaterial,
      rockCount,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let index = 0; index < rockCount; index += 1) {
      const z = -166 + random() * 332;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * (0.72 + random() * 0.62);
      const y = getTerrainHeight(x, z) + 0.12;
      const size = 0.38 + random() * 0.92;
      position.set(x, y, z);
      quaternion.setFromEuler(
        new THREE.Euler(random() * 0.6, random() * Math.PI, random() * 0.6),
      );
      scale.set(size, size * 0.72, size * 0.88);
      matrix.compose(position, quaternion, scale);
      rocks.setMatrixAt(index, matrix);
      color.set(
        index % 4 === 0 ? '#9b917b' : index % 3 === 0 ? '#626b65' : '#85867c',
      );
      rocks.setColorAt(index, color);
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);

    const pebbleGeometry = new THREE.IcosahedronGeometry(0.3, 0);
    const pebbleMaterial = new THREE.MeshStandardMaterial({
      color: '#b3af99',
      roughness: 0.95,
    });
    const pebbleCount = 110;
    const pebbles = new THREE.InstancedMesh(
      pebbleGeometry,
      pebbleMaterial,
      pebbleCount,
    );

    for (let index = 0; index < pebbleCount; index += 1) {
      const z = -164 + random() * 328;
      const width = getStreamWidth(z);
      const lateral = (random() - 0.5) * width * 1.2;
      const x = getStreamX(z) + lateral;
      const y = getTerrainHeight(x, z) + 0.23;
      const size = 0.42 + random() * 0.82;
      position.set(x, y, z);
      quaternion.setFromEuler(
        new THREE.Euler(random() * 0.8, random() * Math.PI, random() * 0.8),
      );
      scale.set(size, size * 0.55, size * 0.8);
      matrix.compose(position, quaternion, scale);
      pebbles.setMatrixAt(index, matrix);
    }
    pebbles.receiveShadow = true;
    this.scene.add(pebbles);

    const sandGeometry = new THREE.CircleGeometry(0.72, 10);
    const sandMaterial = new THREE.MeshStandardMaterial({
      color: '#d6c18f',
      roughness: 1,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const sandCount = 64;
    const sandPatches = new THREE.InstancedMesh(
      sandGeometry,
      sandMaterial,
      sandCount,
    );

    for (let index = 0; index < sandCount; index += 1) {
      const z = -160 + random() * 320;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * (1.02 + random() * 0.32);
      const y = getTerrainHeight(x, z) + 0.2;
      const size = 0.7 + random() * 0.9;
      position.set(x, y, z);
      quaternion.setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, random() * Math.PI),
      );
      scale.set(size * 1.5, size, size);
      matrix.compose(position, quaternion, scale);
      sandPatches.setMatrixAt(index, matrix);
    }
    sandPatches.receiveShadow = true;
    this.scene.add(sandPatches);

    const mossGeometry = new THREE.SphereGeometry(0.42, 8, 5);
    const mossMaterial = new THREE.MeshStandardMaterial({
      color: '#496f48',
      roughness: 1,
    });
    const mossCount = 116;
    const moss = new THREE.InstancedMesh(mossGeometry, mossMaterial, mossCount);
    const mossColor = new THREE.Color();

    for (let index = 0; index < mossCount; index += 1) {
      const z = -162 + random() * 324;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * (1.12 + random() * 0.48);
      const y = getTerrainHeight(x, z) + 0.17;
      const size = 0.52 + random() * 0.9;
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
      scale.set(size, size * 0.18, size * 0.72);
      matrix.compose(position, quaternion, scale);
      moss.setMatrixAt(index, matrix);
      mossColor.set(index % 3 === 0 ? '#5d8453' : '#3e6842');
      moss.setColorAt(index, mossColor);
    }
    moss.receiveShadow = true;
    this.scene.add(moss);

    const reedGeometry = new THREE.ConeGeometry(0.055, 0.86, 5);
    const reedMaterial = new THREE.MeshStandardMaterial({
      color: '#4c774d',
      roughness: 1,
    });
    const reedCount = 120;
    const reeds = new THREE.InstancedMesh(
      reedGeometry,
      reedMaterial,
      reedCount,
    );

    for (let index = 0; index < reedCount; index += 1) {
      const z = -163 + random() * 326;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * (1.05 + random() * 0.35);
      const y = getTerrainHeight(x, z) + 0.38;
      const size = 0.7 + random() * 0.8;
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      reeds.setMatrixAt(index, matrix);
    }
    this.scene.add(reeds);
  }

  buildRiversideWalkways() {
    let seed = 20491;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const group = new THREE.Group();
    group.name = 'riverside-walkways';
    const plankMaterial = createWoodMaterial('#b68b58');
    const railMaterial = createWoodMaterial('#704c31');
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: '#9d9a87',
      roughness: 0.96,
    });
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: '#4f804d',
      roughness: 1,
    });
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: '#f4d28f',
      emissive: '#ffb64d',
      emissiveIntensity: 0.05,
      roughness: 0.35,
    });
    this.walkwayLights.push(lampMaterial);
    const plankGeometry = new THREE.BoxGeometry(0.78, 0.12, 1);
    const stepGeometry = new THREE.BoxGeometry(1.55, 0.16, 0.72);
    const platformGeometry = new THREE.BoxGeometry(2.8, 0.16, 1.7);
    const postGeometry = new THREE.CylinderGeometry(0.065, 0.09, 1, 5);
    const bushGeometry = new THREE.SphereGeometry(0.5, 7, 5);
    const rockGeometry = new THREE.IcosahedronGeometry(0.34, 0);
    const lampGeometry = new THREE.SphereGeometry(0.13, 8, 6);
    let pieceIndex = 0;

    for (let z = -148; z <= 148; z += 10.5) {
      for (const side of [-1, 1]) {
        if (random() < 0.32) {
          continue;
        }

        const centerZ = z + (random() - 0.5) * 2.4;
        const tangentX =
          (getStreamX(centerZ + 0.5) - getStreamX(centerZ - 0.5)) / 1;
        const angle = Math.atan2(tangentX, 1);
        const bankScale = 1.48 + random() * 0.2;
        const x =
          getStreamX(centerZ) + side * getStreamWidth(centerZ) * bankScale;
        const y = getTerrainHeight(x, centerZ) + 0.2;
        const length = 4.8 + random() * 2.8;
        const plank = new THREE.Mesh(plankGeometry, plankMaterial);
        plank.position.set(x, y, centerZ);
        plank.scale.z = length;
        plank.rotation.y = angle;
        plank.castShadow = true;
        plank.receiveShadow = true;
        group.add(plank);

        for (const offset of [-length * 0.32, length * 0.32]) {
          const postX = x + Math.sin(angle) * offset + side * 0.26;
          const postZ = centerZ + Math.cos(angle) * offset;
          const groundY = getTerrainHeight(postX, postZ);
          const height = Math.max(0.2, y - groundY - 0.12);
          const post = new THREE.Mesh(postGeometry, railMaterial);
          post.position.set(postX, groundY + height / 2, postZ);
          post.scale.y = height;
          post.castShadow = true;
          group.add(post);
        }

        if (pieceIndex % 7 === 0) {
          const platform = new THREE.Mesh(platformGeometry, plankMaterial);
          platform.position.set(x, y + 0.04, centerZ);
          platform.rotation.y = angle;
          platform.castShadow = true;
          platform.receiveShadow = true;
          group.add(platform);

          const step = new THREE.Mesh(stepGeometry, stoneMaterial);
          step.position.set(
            x + side * 1.42,
            getTerrainHeight(x + side * 1.42, centerZ) + 0.22,
            centerZ,
          );
          step.rotation.y = angle;
          step.receiveShadow = true;
          group.add(step);

          const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
          lamp.position.set(x, y + 0.58, centerZ);
          group.add(lamp);
        }

        if (random() < 0.34) {
          const bush = new THREE.Mesh(bushGeometry, bushMaterial);
          const bushScale = 0.65 + random() * 0.65;
          const bushX = x + side * (0.72 + random() * 0.7);
          const bushZ = centerZ + 1.1;
          bush.position.set(
            bushX,
            getTerrainHeight(bushX, bushZ) + 0.18,
            bushZ,
          );
          bush.scale.set(bushScale * 1.2, bushScale * 0.7, bushScale);
          bush.castShadow = true;
          group.add(bush);
        }

        if (random() < 0.18) {
          const rock = new THREE.Mesh(rockGeometry, stoneMaterial);
          rock.position.set(
            x + side * 0.34,
            getTerrainHeight(x + side * 0.34, centerZ) + 0.1,
            centerZ - 1.2,
          );
          rock.scale.set(1.1, 0.7, 0.9);
          rock.castShadow = true;
          group.add(rock);
        }

        pieceIndex += 1;
      }
    }

    this.scene.add(group);
  }

  buildStreamLandmarks() {
    const group = new THREE.Group();
    group.name = 'stream-landmarks';
    const woodMaterial = createWoodMaterial('#a97845');
    const darkWoodMaterial = createWoodMaterial('#6f4b30');
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: '#8d8b7b',
      roughness: 0.98,
    });
    const basinMaterial = new THREE.MeshStandardMaterial({
      color: '#a56845',
      roughness: 0.9,
    });
    const deckGeometry = new THREE.BoxGeometry(2.8, 0.18, 1.35);
    const postGeometry = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
    const stoneGeometry = new THREE.IcosahedronGeometry(0.32, 0);

    const addDeck = (z, side) => {
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * 1.48;
      const y = getTerrainHeight(x, z) + 0.28;
      const tangentX = getStreamX(z + 0.5) - getStreamX(z - 0.5);
      const angle = Math.atan2(tangentX, 1);
      const deck = new THREE.Mesh(deckGeometry, woodMaterial);
      deck.position.set(x, y, z);
      deck.rotation.y = angle;
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);

      for (const offset of [-0.9, 0.9]) {
        const postX = x + Math.sin(angle) * offset;
        const postZ = z + Math.cos(angle) * offset;
        const groundY = getTerrainHeight(postX, postZ);
        const height = Math.max(0.25, y - groundY);
        const post = new THREE.Mesh(postGeometry, darkWoodMaterial);
        post.position.set(postX, groundY + height / 2, postZ);
        post.scale.y = height;
        post.castShadow = true;
        group.add(post);
      }

      return { x, y, z, angle };
    };

    const washDeck = addDeck(-82, -1);
    const washboard = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.75, 0.08),
      createWoodMaterial('#c19a65'),
    );
    washboard.position.set(washDeck.x, washDeck.y + 0.72, washDeck.z);
    washboard.rotation.set(-0.32, washDeck.angle, 0);
    washboard.castShadow = true;
    group.add(washboard);

    const washBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.29, 0.24, 12),
      basinMaterial,
    );
    washBasin.position.set(washDeck.x + 0.82, washDeck.y + 0.28, washDeck.z);
    washBasin.castShadow = true;
    group.add(washBasin);

    const washingPoleStart = new THREE.Vector3(
      washDeck.x - 0.95,
      washDeck.y + 2.1,
      washDeck.z,
    );
    const washingPoleEnd = washingPoleStart
      .clone()
      .add(new THREE.Vector3(1.9, 0, 0));
    group.add(
      createBeamBetween(
        washingPoleStart,
        washingPoleEnd,
        0.04,
        darkWoodMaterial,
      ),
    );

    for (let index = 0; index < 4; index += 1) {
      const z = -28 + index * 1.9;
      const centerX = getStreamX(z);
      const width = getStreamWidth(z);
      const x = centerX + (index / 3 - 0.5) * width * 1.25;
      const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
      stone.position.set(x, getTerrainHeight(x, z) + 0.44, z);
      stone.scale.set(1.25, 0.62, 1.05);
      stone.rotation.y = index * 0.48;
      stone.castShadow = true;
      stone.receiveShadow = true;
      group.add(stone);
    }

    const fishingDeck = addDeck(34, 1);
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.34, 10),
      basinMaterial,
    );
    bucket.position.set(
      fishingDeck.x + 0.68,
      fishingDeck.y + 0.32,
      fishingDeck.z,
    );
    bucket.castShadow = true;
    group.add(bucket);

    const fishingRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, 2.6, 5),
      darkWoodMaterial,
    );
    fishingRod.position.set(
      fishingDeck.x - 0.18,
      fishingDeck.y + 0.94,
      fishingDeck.z,
    );
    fishingRod.rotation.z = Math.PI / 2;
    fishingRod.rotation.x = 0.18;
    fishingRod.castShadow = true;
    group.add(fishingRod);

    let seed = 93117;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const shoalGeometry = new THREE.IcosahedronGeometry(0.18, 0);
    const shoalCount = 24;
    const shoal = new THREE.InstancedMesh(
      shoalGeometry,
      stoneMaterial,
      shoalCount,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let index = 0; index < shoalCount; index += 1) {
      const z = 88 + (random() - 0.5) * 12;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + (random() - 0.5) * width * 2.1;
      const size = 0.55 + random() * 0.9;
      position.set(x, getTerrainHeight(x, z) + 0.32, z);
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
      scale.set(size * 1.25, size * 0.65, size);
      matrix.compose(position, quaternion, scale);
      shoal.setMatrixAt(index, matrix);
      color.set(
        index % 3 === 0 ? '#b4ad96' : index % 2 === 0 ? '#797f73' : '#99927d',
      );
      shoal.setColorAt(index, color);
    }
    shoal.castShadow = true;
    shoal.receiveShadow = true;
    group.add(shoal);

    this.scene.add(group);
  }

  buildFoothillBuffer() {
    let seed = 71237;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const group = new THREE.Group();
    group.name = 'foothill-buffer';
    const bandMaterial = (color, opacity) =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity,
        roughness: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    const bands = [
      {
        innerRadius: 70,
        outerRadius: 86,
        material: bandMaterial('#789858', 0.12),
      },
      {
        innerRadius: 82,
        outerRadius: 107,
        material: bandMaterial('#6d9851', 0.16),
      },
      {
        innerRadius: 105,
        outerRadius: 128,
        material: bandMaterial('#8b9172', 0.13),
      },
      {
        innerRadius: 126,
        outerRadius: 148,
        material: bandMaterial('#496f49', 0.15),
      },
      {
        innerRadius: 145,
        outerRadius: 162,
        material: bandMaterial('#687365', 0.1),
      },
    ];

    bands.forEach(({ innerRadius, outerRadius, material }) => {
      const band = new THREE.Mesh(
        createTerrainBandGeometry({
          innerRadius,
          outerRadius,
          segments: 112,
          heightOffset: 0.05,
        }),
        material,
      );
      band.receiveShadow = true;
      group.add(band);
    });

    const shrubGeometry = new THREE.SphereGeometry(0.56, 7, 5);
    const shrubMaterial = new THREE.MeshStandardMaterial({
      color: '#4a7949',
      roughness: 1,
    });
    const shrubPositions = [];
    const shrubCount = 145;
    const rockGeometry = new THREE.IcosahedronGeometry(0.42, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: '#777b70',
      roughness: 1,
    });
    const rockPositions = [];
    const rockCount = 72;

    for (
      let attempt = 0;
      attempt < 1400 &&
      (shrubPositions.length < shrubCount || rockPositions.length < rockCount);
      attempt += 1
    ) {
      const angle = random() * Math.PI * 2;
      const radius = 76 + Math.pow(random(), 0.55) * 82;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const streamDistance = Math.abs(x - getStreamX(z));
      const nearHome = homes.some(
        (home) => Math.hypot(home.x - x, home.z - z) < 7.8,
      );

      if (streamDistance < getStreamWidth(z) * 2.5 || nearHome) {
        continue;
      }

      const position = {
        x,
        z,
        y: getTerrainHeight(x, z) + 0.16,
        scale: 0.7 + random() * 0.9,
        rotation: random() * Math.PI,
      };

      if (random() < 0.68 && shrubPositions.length < shrubCount) {
        shrubPositions.push(position);
      } else if (rockPositions.length < rockCount) {
        rockPositions.push(position);
      }
    }

    const shrubs = new THREE.InstancedMesh(
      shrubGeometry,
      shrubMaterial,
      shrubPositions.length,
    );
    const rocks = new THREE.InstancedMesh(
      rockGeometry,
      rockMaterial,
      rockPositions.length,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const shrubPalette = ['#4f804d', '#3f7146', '#62874e'].map(
      (value) => new THREE.Color(value),
    );

    shrubPositions.forEach((item, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0));
      position.set(item.x, item.y, item.z);
      scale.set(item.scale * 1.16, item.scale * 0.62, item.scale);
      matrix.compose(position, quaternion, scale);
      shrubs.setMatrixAt(index, matrix);
      shrubs.setColorAt(index, shrubPalette[index % shrubPalette.length]);
    });
    rockPositions.forEach((item, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0));
      position.set(item.x, item.y, item.z);
      scale.set(item.scale, item.scale * 0.62, item.scale * 0.82);
      matrix.compose(position, quaternion, scale);
      rocks.setMatrixAt(index, matrix);
      color.set(index % 3 === 0 ? '#8a8879' : '#6e756b');
      rocks.setColorAt(index, color);
    });
    shrubs.castShadow = true;
    shrubs.receiveShadow = true;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    group.add(shrubs, rocks);

    const scatter = (count, minimumRadius, maximumRadius) => {
      const items = [];

      for (
        let attempt = 0;
        attempt < count * 18 && items.length < count;
        attempt += 1
      ) {
        const angle = random() * Math.PI * 2;
        const radius =
          minimumRadius +
          (1 - Math.pow(random(), 1.35)) * (maximumRadius - minimumRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const streamDistance = Math.abs(x - getStreamX(z));
        const nearHome = homes.some(
          (home) => Math.hypot(home.x - x, home.z - z) < 6.4,
        );

        if (
          radius < 34 ||
          streamDistance < getStreamWidth(z) * 2.2 ||
          nearHome
        ) {
          continue;
        }

        items.push({
          x,
          z,
          y: getTerrainHeight(x, z) + 0.12,
          rotation: random() * Math.PI * 2,
          scale: 0.66 + random() * 0.76,
        });
      }

      return items;
    };
    const understoryItems = {
      grass: scatter(190, 62, 146),
      flowers: scatter(80, 64, 142),
      mushrooms: scatter(42, 68, 138),
      deadwood: scatter(16, 72, 142),
    };
    const addInstanced = ({ geometry, material, items, scaleAt, palette }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);

      items.forEach((item, index) => {
        quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0));
        position.set(item.x, item.y, item.z);
        scaleAt(scale, item);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);

        if (palette?.length) {
          mesh.setColorAt(index, palette[index % palette.length]);
        }
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    addInstanced({
      geometry: new THREE.ConeGeometry(0.075, 0.58, 4),
      material: new THREE.MeshStandardMaterial({
        color: '#5f8850',
        roughness: 1,
      }),
      items: understoryItems.grass,
      scaleAt: (target, item) => target.set(item.scale, item.scale, item.scale),
      palette: ['#628a51', '#4e7b49', '#769458'].map(
        (value) => new THREE.Color(value),
      ),
    });
    addInstanced({
      geometry: new THREE.CylinderGeometry(0.014, 0.024, 0.42, 4),
      material: new THREE.MeshStandardMaterial({
        color: '#56804a',
        roughness: 1,
      }),
      items: understoryItems.flowers,
      scaleAt: (target, item) => target.set(item.scale, item.scale, item.scale),
    });
    addInstanced({
      geometry: new THREE.SphereGeometry(0.12, 6, 4),
      material: new THREE.MeshStandardMaterial({
        color: '#f2d7a0',
        roughness: 0.92,
      }),
      items: understoryItems.flowers,
      scaleAt: (target, item) =>
        target.set(item.scale, item.scale * 0.55, item.scale),
      palette: ['#f2d7a0', '#e7a7a0', '#d8d690', '#c7b6e0'].map(
        (value) => new THREE.Color(value),
      ),
    });
    addInstanced({
      geometry: new THREE.CylinderGeometry(0.035, 0.055, 0.17, 5),
      material: new THREE.MeshStandardMaterial({
        color: '#e1d2ad',
        roughness: 0.95,
      }),
      items: understoryItems.mushrooms,
      scaleAt: (target, item) => target.set(item.scale, item.scale, item.scale),
    });
    addInstanced({
      geometry: new THREE.SphereGeometry(0.14, 6, 4),
      material: new THREE.MeshStandardMaterial({
        color: '#b86a55',
        roughness: 0.94,
      }),
      items: understoryItems.mushrooms,
      scaleAt: (target, item) =>
        target.set(item.scale, item.scale * 0.48, item.scale),
      palette: ['#b86a55', '#d4956c', '#a95c4f'].map(
        (value) => new THREE.Color(value),
      ),
    });
    addInstanced({
      geometry: new THREE.CylinderGeometry(0.1, 0.16, 1.8, 5),
      material: new THREE.MeshStandardMaterial({
        color: '#6c5843',
        roughness: 1,
      }),
      items: understoryItems.deadwood,
      scaleAt: (target, item) =>
        target.set(item.scale, item.scale * 0.85, item.scale),
      palette: ['#6c5843', '#7c6549', '#5f5142'].map(
        (value) => new THREE.Color(value),
      ),
    });

    const slopeMounds = scatter(72, 94, 160);
    const slopeShelves = scatter(42, 112, 164);
    addInstanced({
      geometry: new THREE.SphereGeometry(1.25, 8, 5),
      material: new THREE.MeshStandardMaterial({
        color: '#55764a',
        roughness: 1,
      }),
      items: slopeMounds,
      scaleAt: (target, item) =>
        target.set(item.scale * 1.35, item.scale * 0.16, item.scale),
      palette: ['#55764a', '#66844e', '#496b45'].map(
        (value) => new THREE.Color(value),
      ),
    });
    addInstanced({
      geometry: new THREE.BoxGeometry(1.65, 0.16, 0.72),
      material: new THREE.MeshStandardMaterial({
        color: '#70796a',
        roughness: 1,
      }),
      items: slopeShelves,
      scaleAt: (target, item) =>
        target.set(item.scale, item.scale * 0.65, item.scale),
      palette: ['#70796a', '#808878', '#626d64'].map(
        (value) => new THREE.Color(value),
      ),
    });

    this.scene.add(group);
  }

  buildWaterRipples() {
    const geometry = new THREE.RingGeometry(0.34, 0.42, 20);

    for (let index = 0; index < 14; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: '#d9fff6',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ripple = new THREE.Mesh(geometry, material);
      const z = -156 + index * 24;
      const point = getStreamPoint(z);
      ripple.position.copy(point);
      ripple.position.y += 0.08;
      ripple.rotation.x = -Math.PI / 2;
      ripple.userData.phase = index * 0.43;
      this.streamRipples.push(ripple);
      this.scene.add(ripple);
    }
  }

  buildWaterfalls() {
    const waterfallZs = [-128, -67, -21, 29, 73, 132];
    this.waterfallMaterials = [];

    waterfallZs.forEach((z, index) => {
      const point = getStreamPoint(z);
      const width = getStreamWidth(z) * 0.72;
      const material = new THREE.MeshBasicMaterial({
        color: '#e7fffb',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const waterfall = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 1.4 + index * 0.18, 1, 3),
        material,
      );
      waterfall.position.copy(point);
      waterfall.position.y += 0.72;
      waterfall.rotation.y = Math.atan2(
        getStreamX(z + 0.5) - getStreamX(z - 0.5),
        1,
      );
      this.waterfallMaterials.push(material);
      this.scene.add(waterfall);

      const mistMaterial = new THREE.MeshBasicMaterial({
        color: '#eafff9',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      const mist = new THREE.Mesh(
        new THREE.SphereGeometry(0.7 + width * 0.2, 10, 7),
        mistMaterial,
      );
      mist.scale.set(1.8, 0.55, 1.1);
      mist.position.copy(point);
      mist.position.y += 0.45;
      this.scene.add(mist);
    });
  }

  addBridgePier(point) {
    const streamX = getStreamX(point.z);
    const width = getStreamWidth(point.z);
    const pierMaterial = createWoodMaterial('#5f432e');
    const underwaterMaterial = createWoodMaterial('#4f3a2b');
    const baseY = getTerrainHeight(streamX, point.z) + 0.15;
    const waterY = getTerrainHeight(streamX, point.z) + 0.5;

    for (const side of [-1, 1]) {
      const x = streamX + side * width * 0.96;
      const topY = point.y - 0.6;
      const height = Math.max(0.8, topY - baseY);
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.32, height, 7),
        pierMaterial,
      );
      pier.position.set(x, baseY + height / 2, point.z);
      pier.castShadow = true;
      this.scene.add(pier);

      const wetBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.31, 0.42, 7),
        underwaterMaterial,
      );
      wetBand.position.set(x, waterY - 0.03, point.z);
      wetBand.castShadow = true;
      this.scene.add(wetBand);
    }

    for (const lateral of [-0.62, -0.28, 0.28, 0.62]) {
      const x = streamX + width * lateral;
      const topY = point.y - 0.82;
      const height = Math.max(0.75, topY - baseY);
      const pile = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.14, height, 6),
        underwaterMaterial,
      );
      pile.position.set(x, baseY + height / 2, point.z);
      pile.castShadow = true;
      this.scene.add(pile);
    }

    this.bridgeFoamGeometry ||= new THREE.RingGeometry(0.42, 0.78, 18);
    this.bridgeFoamMaterial ||= new THREE.MeshBasicMaterial({
      color: '#d9fff7',
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const foam = new THREE.Mesh(
      this.bridgeFoamGeometry,
      this.bridgeFoamMaterial,
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(streamX, waterY, point.z);
    foam.scale.set(1.45, 0.82, 1);
    this.scene.add(foam);
  }

  buildForest() {
    let trunkGeometry;
    let trunkMaterial;
    let canopyGeometry;
    let canopyMaterial;

    this.models.tree.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      if (!trunkGeometry) {
        trunkGeometry = bakeGeometry(child);
        trunkMaterial = child.material.clone();
      } else {
        canopyGeometry = bakeGeometry(child);
        canopyMaterial = child.material.clone();
      }
    });

    const positions = [];
    let seed = 92471;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let attempt = 0; attempt < 3200; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 13 + random() * 158;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z);

      if (
        Math.abs(x - Math.sin(z * 0.075) * 9) < 4.8 ||
        homes.some((home) => Math.hypot(home.x - x, home.z - z) < 6.1)
      ) {
        continue;
      }

      positions.push({
        x,
        y,
        z,
        scale: 0.72 + random() * 0.82,
        rotation: random() * Math.PI * 2,
      });
    }

    const nearPositions = positions
      .filter((tree) => Math.hypot(tree.x, tree.z) < 88)
      .slice(0, 270);
    const farPositions = positions
      .filter((tree) => Math.hypot(tree.x, tree.z) >= 72)
      .slice(0, 480);
    const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      trunkMaterial,
      nearPositions.length,
    );
    const canopies = new THREE.InstancedMesh(
      canopyGeometry,
      canopyMaterial,
      nearPositions.length,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const canopyPalette = [
      '#2f6d47',
      '#3e7e4f',
      '#557f4b',
      '#6f9155',
      '#356f5a',
    ].map((value) => new THREE.Color(value));

    nearPositions.forEach((tree, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, tree.rotation, 0));
      position.set(tree.x, tree.y, tree.z);
      scale.setScalar(tree.scale);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);
      canopies.setMatrixAt(index, matrix);
      canopies.setColorAt(index, canopyPalette[index % canopyPalette.length]);
    });
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    canopies.castShadow = true;
    canopies.receiveShadow = true;
    this.scene.add(trunks, canopies);
    this.forestCanopyMaterial = canopyMaterial;

    const farTrunkGeometry = new THREE.CylinderGeometry(0.12, 0.17, 1.6, 5);
    const farCanopyGeometry = new THREE.ConeGeometry(0.95, 3.4, 6);
    const farTrunkMaterial = new THREE.MeshStandardMaterial({
      color: '#654a35',
      roughness: 1,
    });
    const farCanopyMaterial = new THREE.MeshStandardMaterial({
      color: '#315d43',
      roughness: 1,
    });
    const farTrunks = new THREE.InstancedMesh(
      farTrunkGeometry,
      farTrunkMaterial,
      farPositions.length,
    );
    const farCanopies = new THREE.InstancedMesh(
      farCanopyGeometry,
      farCanopyMaterial,
      farPositions.length,
    );

    farPositions.forEach((tree, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, tree.rotation, 0));
      position.set(tree.x, tree.y + 0.8, tree.z);
      scale.setScalar(tree.scale * 0.92);
      matrix.compose(position, quaternion, scale);
      farTrunks.setMatrixAt(index, matrix);
      position.set(tree.x, tree.y + 2.55, tree.z);
      matrix.compose(position, quaternion, scale);
      farCanopies.setMatrixAt(index, matrix);
      farCanopies.setColorAt(
        index,
        canopyPalette[(index + 2) % canopyPalette.length],
      );
    });
    farTrunks.receiveShadow = true;
    farCanopies.receiveShadow = true;
    this.scene.add(farTrunks, farCanopies);
    this.treeCount = nearPositions.length + farPositions.length;

    canopyMaterial.userData.windUniform = {
      value: 1,
    };
    canopyMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = canopyMaterial.userData.windUniform;
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
          vec3 transformed = vec3(position);
          float sway = sin(uWind * 2.1 + position.y * 1.8) * 0.045;
          transformed.x += sway * max(position.y, 0.0);
          transformed.z += sway * 0.65 * max(position.y, 0.0);
        `,
      );
    };
  }

  buildPlazaFurnishings(group) {
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: '#8e8979',
      roughness: 0.98,
    });
    const benchMaterial = createWoodMaterial('#b4824e');
    const shelfMaterial = createWoodMaterial('#8d623c');
    const fireMaterial = new THREE.MeshStandardMaterial({
      color: '#ffd17d',
      emissive: '#ff6d25',
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    this.plazaLights.push(fireMaterial);

    const fireBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.34, 1.5, 0.28, 18),
      stoneMaterial,
    );
    fireBase.position.set(-5.8, 3.78, 0);
    fireBase.castShadow = true;
    group.add(fireBase);

    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 1.7, 6),
        createWoodMaterial('#6b4a31'),
      );
      log.position.set(
        -5.8 + Math.cos(angle) * 0.28,
        4.02 + (index % 2) * 0.12,
        Math.sin(angle) * 0.28,
      );
      log.rotation.z = Math.PI / 2;
      log.rotation.y = angle;
      group.add(log);
    }

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 1.15, 8),
      fireMaterial,
    );
    flame.position.set(-5.8, 4.62, 0);
    flame.scale.z = 0.72;
    group.add(flame);

    this.plazaFireLight = new THREE.PointLight('#ff9b52', 0.5, 36, 1.75);
    this.plazaFireLight.position.set(-5.8, 5.25, 0);
    group.add(this.plazaFireLight);

    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const radius = 2.65;
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.18, 0.46),
        benchMaterial,
      );
      seat.position.set(
        -5.8 + Math.cos(angle) * radius,
        4.2,
        Math.sin(angle) * radius,
      );
      seat.rotation.y = -angle;
      seat.castShadow = true;
      group.add(seat);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.52, 0.12),
        benchMaterial,
      );
      back.position.set(
        -5.8 + Math.cos(angle) * (radius + 0.18),
        4.48,
        Math.sin(angle) * (radius + 0.18),
      );
      back.rotation.y = -angle;
      back.castShadow = true;
      group.add(back);
    }

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.24, 1.0),
      benchMaterial,
    );
    tableTop.position.set(6.2, 4.36, 0);
    tableTop.castShadow = true;
    group.add(tableTop);

    [-1.2, 1.2].forEach((offset) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 1.2, 0.62),
        shelfMaterial,
      );
      leg.position.set(6.2 + offset, 3.82, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    const storageRack = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.45, 0.45),
      shelfMaterial,
    );
    storageRack.position.set(8.4, 4.25, 3.9);
    storageRack.rotation.y = -0.48;
    storageRack.castShadow = true;
    group.add(storageRack);

    const displayBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.42, 12),
      stoneMaterial,
    );
    displayBase.position.set(7.4, 3.92, -4.2);
    displayBase.castShadow = true;
    group.add(displayBase);

    const displayTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.92, 10),
      benchMaterial,
    );
    displayTop.position.set(7.4, 4.55, -4.2);
    displayTop.castShadow = true;
    group.add(displayTop);

    [-0.85, 0.85].forEach((offset) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 2.5, 0.14),
        shelfMaterial,
      );
      post.position.set(offset, 4.65, -7.2);
      post.castShadow = true;
      group.add(post);
    });
    const noticeBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.35, 0.18),
      createWoodMaterial('#c89b61'),
    );
    noticeBoard.position.set(0, 5.2, -7.2);
    noticeBoard.castShadow = true;
    group.add(noticeBoard);

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6),
        shelfMaterial,
      );
      pole.position.set(Math.cos(angle) * 9.6, 5.7, Math.sin(angle) * 9.6);
      pole.castShadow = true;
      group.add(pole);

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.72, 1, 2),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? '#a84f3f' : '#e0b46b',
          side: THREE.DoubleSide,
          roughness: 0.88,
        }),
      );
      flag.position.set(pole.position.x + 0.66, 7.2, pole.position.z);
      flag.rotation.y = -angle + Math.PI / 2;
      group.add(flag);
    }

    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const torch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 2.0, 6),
        createWoodMaterial('#67472e'),
      );
      torch.position.set(Math.cos(angle) * 11.4, 4.7, Math.sin(angle) * 11.4);
      torch.castShadow = true;
      group.add(torch);

      const torchGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        fireMaterial,
      );
      torchGlow.position.copy(torch.position);
      torchGlow.position.y += 1.18;
      group.add(torchGlow);
    }

    for (let index = 0; index < 3; index += 1) {
      const chime = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5),
        new THREE.MeshStandardMaterial({
          color: '#d7c28c',
          metalness: 0.25,
          roughness: 0.55,
        }),
      );
      chime.position.set(-1.3 + index * 0.34, 5.75, 7.5);
      group.add(chime);
    }
  }

  buildPlazaStoneDetails(group) {
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: '#9f978a',
      roughness: 0.95,
      metalness: 0.02,
    });
    const darkStoneMaterial = new THREE.MeshStandardMaterial({
      color: '#71695e',
      roughness: 0.98,
    });
    const groutMaterial = new THREE.MeshStandardMaterial({
      color: '#837b6e',
      roughness: 1,
    });

    // 石板纹路：同心环 + 放射接缝
    [4.4, 8.4, 12.4].forEach((radius) => {
      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.09, 6, 56),
        groutMaterial,
      );
      seam.rotation.x = Math.PI / 2;
      seam.position.y = 1.96;
      group.add(seam);
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, 15.2),
        groutMaterial,
      );
      seam.position.set(Math.cos(angle) * 7.6, 1.96, Math.sin(angle) * 7.6);
      seam.rotation.y = -angle;
      group.add(seam);
    }

    // 简易石质长凳（4 条，对角布置）
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 13.1;
      const z = Math.sin(angle) * 13.1;
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.24, 0.7),
        stoneMaterial,
      );
      seat.position.set(x, 2.32, z);
      seat.rotation.y = -angle;
      seat.castShadow = true;
      seat.receiveShadow = true;
      group.add(seat);

      [-0.95, 0.95].forEach((offset) => {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.46, 0.44),
          darkStoneMaterial,
        );
        leg.position.set(
          x + Math.sin(angle) * offset,
          2.12,
          z - Math.cos(angle) * offset,
        );
        leg.rotation.y = -angle;
        leg.castShadow = true;
        group.add(leg);
      });
    }

    // 小型花坛（4 个，正向布置）
    const flowerPalette = [
      '#e06a6a',
      '#e8a34e',
      '#c86fd0',
      '#e8d04e',
      '#e67a8a',
    ];
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      const x = Math.cos(angle) * 11.3;
      const z = Math.sin(angle) * 11.3;
      const bed = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.22, 8, 24),
        darkStoneMaterial,
      );
      bed.rotation.x = Math.PI / 2;
      bed.position.set(x, 2.12, z);
      bed.castShadow = true;
      bed.receiveShadow = true;
      group.add(bed);

      for (let flower = 0; flower < 5; flower += 1) {
        const flowerAngle = (flower / 5) * Math.PI * 2;
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 6),
          new THREE.MeshStandardMaterial({
            color: flowerPalette[flower],
            roughness: 0.6,
          }),
        );
        bloom.position.set(
          x + Math.cos(flowerAngle) * 0.46,
          2.36,
          z + Math.sin(flowerAngle) * 0.46,
        );
        group.add(bloom);
      }
    }

    // 景观小树（6 棵，绕广场外缘）
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + 0.32;
      const x = Math.cos(angle) * 14.5;
      const z = Math.sin(angle) * 14.5;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.21, 1.7, 6),
        createWoodMaterial('#6b4a31'),
      );
      trunk.position.set(x, 2.75, z);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      group.add(trunk);

      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(0.82, 1.9, 7),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? '#3c7a4f' : '#4b8a57',
          roughness: 0.9,
        }),
      );
      canopy.position.set(x, 3.95, z);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      group.add(canopy);
    }
  }

  buildCentralPlaza() {
    const group = new THREE.Group();
    group.name = 'life-plaza';

    const deckMaterial = new THREE.MeshStandardMaterial({
      color: '#a49d8f',
      roughness: 0.94,
      metalness: 0.02,
    });
    this.plazaDeckMaterial = deckMaterial;
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 18, 1.4, 48),
      deckMaterial,
    );
    deck.position.y = 1.2;
    deck.receiveShadow = true;
    group.add(deck);

    const upperDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(10.5, 12, 1.1, 40),
      createWoodMaterial('#b1844f'),
    );
    upperDeck.position.y = 3.1;
    upperDeck.receiveShadow = true;
    group.add(upperDeck);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(16, 0.72, 8, 64),
      createWoodMaterial(WOOD_DARK),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.1;
    ring.castShadow = true;
    group.add(ring);

    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.5, 32),
      new THREE.MeshPhysicalMaterial({
        color: '#78d0c1',
        transparent: true,
        opacity: 0.82,
        roughness: 0.12,
      }),
    );
    pool.position.y = 4.1;
    group.add(pool);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 20, 14),
      new THREE.MeshStandardMaterial({
        color: '#e4f6ec',
        emissive: '#bfe8d2',
        emissiveIntensity: 0.32,
        roughness: 0.2,
      }),
    );
    core.position.y = 6;
    group.add(core);
    this.centralCore = core;

    this.centralPointLight = new THREE.PointLight('#ffe6cc', 1.35, 44, 1.6);
    this.centralPointLight.position.set(0, 8, 0);
    group.add(this.centralPointLight);

    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * Math.PI * 2;
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.32, 8, 7),
        createWoodMaterial(WOOD_DARK),
      );
      post.position.set(Math.cos(angle) * 14.8, 7, Math.sin(angle) * 14.8);
      post.castShadow = true;
      group.add(post);

      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(15, 0.45, 0.55),
        createWoodMaterial(WOOD),
      );
      beam.position.set(Math.cos(angle) * 7.4, 10.2, Math.sin(angle) * 7.4);
      beam.rotation.y = -angle;
      beam.castShadow = true;
      group.add(beam);
    }

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(18, 5, 48, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: '#d9eee7',
        transparent: true,
        opacity: 0.46,
        side: THREE.DoubleSide,
        roughness: 0.25,
      }),
    );
    roof.position.y = 12.4;
    group.add(roof);

    this.buildPlazaFurnishings(group);
    this.buildPlazaStoneDetails(group);
    group.scale.setScalar(1.5);

    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.selectionType = 'center';
        this.clickableMeshes.push(child);
      }
    });
    this.scene.add(group);
    this.centralGroup = group;
  }

  buildPlazaConnections() {
    const group = new THREE.Group();
    group.name = 'plaza-connections';
    const walkwayMaterial = createWoodMaterial('#b1844f');
    const edgeMaterial = createWoodMaterial(WOOD_DARK);
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: '#a39a83',
      roughness: 0.96,
    });
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: '#ffe1a4',
      emissive: '#ffb85c',
      emissiveIntensity: 0.08,
      roughness: 0.25,
    });
    const lampGeometry = new THREE.SphereGeometry(0.16, 8, 6);
    const postGeometry = new THREE.CylinderGeometry(0.07, 0.09, 1, 6);
    this.plazaLights.push(lampMaterial);

    bridgeNetwork.forEach((bridge) => {
      const angle = Math.atan2(bridge.hub.z, bridge.hub.x);
      const radius = 28.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z) + 0.34;
      const landing = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 0.22, 2.5),
        walkwayMaterial,
      );
      landing.position.set(x, y, z);
      landing.rotation.y = -angle;
      landing.castShadow = true;
      landing.receiveShadow = true;
      group.add(landing);

      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(6.6, 0.18, 0.16),
          edgeMaterial,
        );
        edge.position.set(
          x + Math.cos(angle + Math.PI / 2) * side * 1.18,
          y + 0.16,
          z + Math.sin(angle + Math.PI / 2) * side * 1.18,
        );
        edge.rotation.y = -angle;
        edge.castShadow = true;
        group.add(edge);
      }

      for (let step = 0; step < 3; step += 1) {
        const stepRadius = 31.4 + step * 0.68;
        const stepX = Math.cos(angle) * stepRadius;
        const stepZ = Math.sin(angle) * stepRadius;
        const stepMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 0.14, 0.72),
          step < 2 ? walkwayMaterial : stoneMaterial,
        );
        stepMesh.position.set(
          stepX,
          getTerrainHeight(stepX, stepZ) + 0.24 + step * 0.05,
          stepZ,
        );
        stepMesh.rotation.y = -angle;
        stepMesh.receiveShadow = true;
        group.add(stepMesh);
      }

      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set(
        x + Math.cos(angle + Math.PI / 2) * 2.25,
        y + 0.92,
        z + Math.sin(angle + Math.PI / 2) * 2.25,
      );
      group.add(lamp);

      const post = new THREE.Mesh(postGeometry, edgeMaterial);
      post.position.set(lamp.position.x, y + 0.04, lamp.position.z);
      post.scale.y = 0.9;
      post.castShadow = true;
      group.add(post);
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const radius = 27.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = getTerrainHeight(x, z) + 0.26;
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set(x, y + 0.72, z);
      group.add(lamp);
      const post = new THREE.Mesh(postGeometry, edgeMaterial);
      post.position.set(x, y, z);
      post.scale.y = 0.72;
      post.castShadow = true;
      group.add(post);
    }

    this.scene.add(group);
  }

  buildBridgeNetwork() {
    const material = createWoodMaterial(WOOD);
    const privateMaterial = createWoodMaterial('#b28755');
    const supportMaterial = createWoodMaterial('#62452f');
    const supportGeometry = new THREE.CylinderGeometry(0.1, 0.16, 1, 6);
    const supportShadowGeometry = new THREE.CircleGeometry(0.42, 8);
    const supportShadowMaterial = new THREE.MeshBasicMaterial({
      color: '#1c2a22',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const center = new THREE.Vector3(0, 6.2, 0);
    const addBridge = (
      curve,
      tubeMaterial = material,
      radius = 0.44,
      segmentScale = 1.25,
      restProgress = null,
    ) => {
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 30, radius, 7, false),
        tubeMaterial,
      );
      tube.castShadow = true;
      tube.receiveShadow = true;
      this.scene.add(tube);
      if (radius >= 0.2) {
        this.addBridgeAbutment(curve, 0.03);
        this.addBridgeAbutment(curve, 0.97);
      }

      const leftRail = [];
      const rightRail = [];
      const bridgeSamples = 14;

      for (let index = 0; index <= bridgeSamples; index += 1) {
        const progress = index / bridgeSamples;
        const point = curve.getPointAt(progress);
        const tangent = curve.getTangentAt(progress);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        leftRail.push(
          point
            .clone()
            .addScaledVector(normal, -0.62)
            .add(new THREE.Vector3(0, 0.72, 0)),
        );
        rightRail.push(
          point
            .clone()
            .addScaledVector(normal, 0.62)
            .add(new THREE.Vector3(0, 0.72, 0)),
        );
      }

      [leftRail, rightRail].forEach((railPoints) => {
        const railCurve = new THREE.CatmullRomCurve3(railPoints);
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(railCurve, 28, 0.075, 5, false),
          createWoodMaterial('#765336'),
        );
        rail.castShadow = true;
        this.scene.add(rail);
      });

      const supportProgress =
        radius < 0.2 ? [0.34, 0.68] : [0.16, 0.34, 0.52, 0.7, 0.86];
      supportProgress.forEach((progress) => {
        const point = curve.getPointAt(progress);
        const tangent = curve.getTangentAt(progress);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        let hasSupport = false;

        [-0.42, 0.42].forEach((offset) => {
          const base = point.clone().addScaledVector(normal, offset);
          const groundY = getTerrainHeight(base.x, base.z) + 0.06;
          const height = point.y - groundY - 0.12;

          if (height < 0.86) {
            return;
          }

          hasSupport = true;
          const support = new THREE.Mesh(supportGeometry, supportMaterial);
          support.position.set(base.x, groundY + height / 2, base.z);
          support.scale.y = height;
          support.castShadow = true;
          this.scene.add(support);
        });

        if (!hasSupport) {
          return;
        }

        const leftBase = point.clone().addScaledVector(normal, -0.42);
        const rightBase = point.clone().addScaledVector(normal, 0.42);
        this.scene.add(
          createBeamBetween(leftBase, rightBase, 0.07, supportMaterial),
        );

        const shadow = new THREE.Mesh(
          supportShadowGeometry,
          supportShadowMaterial,
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(
          point.x,
          getTerrainHeight(point.x, point.z) + 0.08,
          point.z,
        );
        this.scene.add(shadow);
      });

      for (let index = 1; index < bridgeSamples; index += 2) {
        const progress = index / bridgeSamples;
        const point = curve.getPointAt(progress);
        const tangent = curve.getTangentAt(progress);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        [-1, 1].forEach((side) => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.08, 0.9, 5),
            createWoodMaterial('#735034'),
          );
          post.position.copy(point).addScaledVector(normal, side * 0.62);
          post.position.y += 0.34;
          post.castShadow = true;
          this.scene.add(post);
        });

        const leftBase = point.clone().addScaledVector(normal, -0.62);
        const rightBase = point.clone().addScaledVector(normal, 0.62);
        const leftTop = leftBase.clone().add(new THREE.Vector3(0, 0.72, 0));
        const rightTop = rightBase.clone().add(new THREE.Vector3(0, 0.72, 0));
        const trussMaterial = createWoodMaterial('#765336');
        this.scene.add(
          createBeamBetween(leftTop, rightTop, 0.065, trussMaterial),
          createBeamBetween(leftBase, rightTop, 0.055, trussMaterial),
          createBeamBetween(rightBase, leftTop, 0.055, trussMaterial),
        );
      }

      const segment = this.models.bridgeSegment.clone();
      const point = curve.getPointAt(0.55);
      const tangent = curve.getTangentAt(0.55);
      segment.position.copy(point);
      segment.lookAt(point.clone().add(tangent));
      segment.scale.setScalar(segmentScale);
      this.scene.add(segment);
      if (restProgress !== null) {
        this.addCorridorRestNode(curve, restProgress);
      }
      return tube;
    };

    bridgeNetwork.forEach((bridge, index) => {
      const hub = new THREE.Vector3(
        bridge.hub.x,
        bridge.hub.y + 4.4,
        bridge.hub.z,
      );
      const middle = center
        .clone()
        .lerp(hub, 0.5)
        .add(
          new THREE.Vector3(
            index % 2 === 0 ? 5 : -5,
            5.5,
            index % 2 === 0 ? 4 : -4,
          ),
        );
      const curve = new THREE.CatmullRomCurve3([center, middle, hub]);
      addBridge(curve, material, 0.5, 1.35, index % 2 === 0 ? 0.38 : 0.7);

      let pierPlaced = false;

      for (let sample = 0.12; sample < 0.94 && !pierPlaced; sample += 0.06) {
        const point = curve.getPointAt(sample);
        if (
          Math.abs(point.x - getStreamX(point.z)) <
          getStreamWidth(point.z) * 1.05
        ) {
          this.addBridgePier(point);
          pierPlaced = true;
        }
      }
    });

    crossGroupBridges.forEach((bridge) => {
      const from = new THREE.Vector3(
        bridge.from.x,
        getTerrainHeight(bridge.from.x, bridge.from.z) + 3.2,
        bridge.from.z,
      );
      const to = new THREE.Vector3(
        bridge.to.x,
        getTerrainHeight(bridge.to.x, bridge.to.z) + 3.2,
        bridge.to.z,
      );
      const middle = from
        .clone()
        .lerp(to, 0.5)
        .add(new THREE.Vector3(0, 3.8, 0));
      const curve = new THREE.CatmullRomCurve3([from, middle, to]);
      addBridge(curve, material, 0.56, 1.45, 0.44);
      this.addBridgePier(middle);
    });

    homes.forEach((home) => {
      const hub = getNearestHub(home);
      const start = new THREE.Vector3(hub.x, hub.y + 3.2, hub.z);
      const end = new THREE.Vector3(home.x, home.y + 2.2, home.z);
      const middle = start
        .clone()
        .lerp(end, 0.52)
        .add(
          new THREE.Vector3(
            (home.number % 2 ? 1 : -1) * 1.6,
            1.8,
            (home.number % 3 ? 1 : -1) * 1.2,
          ),
        );
      const curve = new THREE.CatmullRomCurve3([start, middle, end]);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 22, 0.14, 6, false),
        privateMaterial,
      );
      tube.castShadow = false;
      tube.visible = false;
      this.scene.add(tube);
      this.addHomeLanding(start, end, privateMaterial);

      const crossingPoint = curve.getPointAt(0.62);
      if (
        Math.abs(crossingPoint.x - getStreamX(crossingPoint.z)) <
        getStreamWidth(crossingPoint.z) * 1.2
      ) {
        this.addBridgePier(crossingPoint);
      }
    });
  }

  addBridgeAbutment(curve, progress) {
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    const angle = Math.atan2(tangent.x, tangent.z);
    const baseY = Math.max(
      getTerrainHeight(point.x, point.z) + 0.28,
      point.y - 0.72,
    );
    const abutment = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.34, 1.35),
      new THREE.MeshStandardMaterial({
        color: '#858477',
        roughness: 0.98,
      }),
    );
    abutment.position.set(point.x, baseY, point.z);
    abutment.rotation.y = angle;
    abutment.castShadow = true;
    abutment.receiveShadow = true;
    this.scene.add(abutment);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 0.9, 6),
        createWoodMaterial('#654830'),
      );
      post.position.set(
        point.x + Math.cos(angle) * side * 0.64,
        baseY + 0.18,
        point.z - Math.sin(angle) * side * 0.64,
      );
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  addCorridorRestNode(curve, progress) {
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const groundY = getTerrainHeight(point.x, point.z);
    const platformY = Math.max(groundY + 0.55, point.y - 0.65);
    const woodMaterial = createWoodMaterial('#a97946');
    const darkWoodMaterial = createWoodMaterial('#6b4a31');
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: '#ffe0a0',
      emissive: '#ffb14f',
      emissiveIntensity: 0.1,
      roughness: 0.3,
    });
    const group = new THREE.Group();
    group.position.set(point.x, platformY, point.z);
    group.rotation.y = -Math.atan2(tangent.z, tangent.x);
    this.corridorLights.push(lampMaterial);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 1.65),
      woodMaterial,
    );
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);

    for (const x of [-0.78, 0.78]) {
      const z = 0.34;
      const supportBaseY = getTerrainHeight(point.x + x, point.z + z);
      const height = Math.max(0.35, platformY - supportBaseY);
      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, height, 6),
        darkWoodMaterial,
      );
      support.position.set(x, supportBaseY + height / 2 - platformY, z);
      support.castShadow = true;
      group.add(support);
    }

    const benchSeat = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.16, 0.42),
      woodMaterial,
    );
    benchSeat.position.set(0, 0.34, 0.34);
    benchSeat.castShadow = true;
    group.add(benchSeat);

    const benchBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.55, 0.12),
      darkWoodMaterial,
    );
    benchBack.position.set(0, 0.63, 0.5);
    benchBack.castShadow = true;
    group.add(benchBack);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.16, 1.55),
      new THREE.MeshPhysicalMaterial({
        color: '#d0aa70',
        transparent: true,
        opacity: 0.82,
        roughness: 0.72,
      }),
    );
    roof.position.y = 2.15;
    roof.rotation.z = -0.08;
    roof.castShadow = true;
    group.add(roof);

    for (const x of [-0.86, 0.86]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.08, 2, 6),
        darkWoodMaterial,
      );
      post.position.set(x, 1.1, 0.58);
      post.castShadow = true;
      group.add(post);
    }

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      lampMaterial,
    );
    lamp.position.set(0, 1.78, 0.52);
    group.add(lamp);
    this.scene.add(group);
  }

  addHomeLanding(start, end, material) {
    const direction = end.clone().sub(start);
    direction.y = 0;
    direction.normalize();
    const landingPosition = end.clone().addScaledVector(direction, 1.65);
    const groundY = getTerrainHeight(landingPosition.x, landingPosition.z);
    const landingY = Math.max(groundY + 0.22, end.y - 0.62);
    const landing = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 0.18, 1.55),
      material,
    );
    landing.position.set(landingPosition.x, landingY, landingPosition.z);
    landing.rotation.y = Math.atan2(direction.x, direction.z);
    landing.castShadow = true;
    landing.receiveShadow = true;
    this.scene.add(landing);

    for (let step = 0; step < 2; step += 1) {
      const stepPosition = end
        .clone()
        .addScaledVector(direction, 2.8 + step * 0.64);
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.15, 0.66),
        material,
      );
      stepMesh.position.set(
        stepPosition.x,
        getTerrainHeight(stepPosition.x, stepPosition.z) + 0.22 + step * 0.04,
        stepPosition.z,
      );
      stepMesh.rotation.y = Math.atan2(direction.x, direction.z);
      stepMesh.receiveShadow = true;
      this.scene.add(stepMesh);
    }
  }

  getModelBounds(group) {
    const key =
      group === 'cliff' ? 'cliff' : group === 'forest' ? 'forest' : 'terrace';
    if (this._modelBoundsCache[key]) {
      return this._modelBoundsCache[key];
    }
    const model =
      key === 'cliff'
        ? this.models.cliffManor
        : key === 'forest'
          ? this.models.forestManor
          : this.models.terraceManor;
    const box = new THREE.Box3().setFromObject(model);
    this._modelBoundsCache[key] = box;
    return box;
  }

  // 给已分配户主（原住民）的宅院屋顶，挂一盏暖黄小灯笼 + 木牌署名。
  // 灯笼白天是普通小灯笼（不发光）；傍晚/夜间随 nightBlend 自动亮起：柔光晕 + 低强度暖点光，不刺眼。
  // 灯笼与木牌稳定锚定屋顶世界坐标，木牌 Sprite 始终朝向镜头但位置不随镜头漂移。
  addResidentBeacon(home, residentName) {
    const scale = home.scale * (home.variant === 2 ? 1.16 : 1) * 1.18;
    const modelBox = this.getModelBounds(home.group);
    const center = modelBox.getCenter(new THREE.Vector3());
    const roofTopY = home.y + 0.2 + modelBox.max.y * scale;
    const anchorX = home.x + center.x * scale;
    const anchorZ = home.z + center.z * scale;

    const group = new THREE.Group();
    group.position.set(anchorX, roofTopY, anchorZ);

    // 挂绳：从屋顶连到灯笼顶部，细木色，营造"挂在屋顶"的感觉。
    const cordMaterial = new THREE.MeshBasicMaterial({
      color: '#6f5a3c',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
      cordMaterial,
    );
    cord.position.y = 0.85;
    group.add(cord);

    // 灯笼上下木盖：小巧，给纸灯笼轮廓。
    const capMaterial = new THREE.MeshStandardMaterial({
      color: '#7a5a36',
      roughness: 0.85,
      metalness: 0.04,
    });
    const capTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.16, 14),
      capMaterial,
    );
    capTop.position.y = 1.68;
    capTop.userData = {
      selectionType: 'residentHome',
      residentName,
      homeId: home.id,
    };
    const capBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.26, 0.16, 14),
      capMaterial,
    );
    capBottom.position.y = 1.34;
    capBottom.userData = {
      selectionType: 'residentHome',
      residentName,
      homeId: home.id,
    };
    group.add(capTop, capBottom);

    // 灯笼纸身：暖色半透明，始终可见；夜晚才提亮并配合光晕/点光"亮起"。
    const paperMaterial = new THREE.MeshBasicMaterial({
      color: LANTERN_DAY_COLOR.clone(),
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      fog: false,
    });
    const paper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.64, 16, 1, true),
      paperMaterial,
    );
    paper.position.y = 1.51;
    paper.userData = {
      selectionType: 'residentHome',
      residentName,
      homeId: home.id,
    };
    group.add(paper);

    // 柔光晕：径向渐变 Sprite，加色混合但低透明度，夜晚才显现，避免白天/刺眼光。
    const haloTexture =
      this._lanternHaloTexture ||
      (this._lanternHaloTexture = createRadialSpriteTexture(128));
    const haloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      color: new THREE.Color(LANTERN_HALO),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.set(3.0, 3.0, 1);
    halo.position.y = 1.51;
    group.add(halo);

    // 点光源：傍晚/夜间低强度暖光，在屋顶投出柔和暖色光池（不刺眼）。
    const light = new THREE.PointLight(LANTERN_LIGHT, 0, 13, 2);
    light.position.y = 1.51;
    group.add(light);

    // 木牌（灯笼下方）：户主名，始终朝向镜头、不被树木遮挡。
    const sign = createWoodSignSprite(`${residentName}的家`);
    sign.position.set(0, 0.5, 0);
    sign.scale.set(3.2, 1.33, 1);
    sign.userData = {
      selectionType: 'residentHome',
      residentName,
      homeId: home.id,
    };
    group.add(sign);

    // 不可见点击命中体：覆盖灯笼+木牌区域，方便点击识别归属，无需精确点到小灯笼。
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, 2.8, 12, 1, true),
      hitMaterial,
    );
    hit.position.y = 1.35;
    hit.userData = {
      selectionType: 'residentHome',
      residentName,
      homeId: home.id,
    };
    group.add(hit);

    this.scene.add(group);
    this.clickableMeshes.push(paper, capTop, capBottom, sign, hit);
    this.residentBeacons.set(home.id, {
      group,
      haloMaterial,
      paperMaterial,
      light,
      sign,
      phase: Math.random() * Math.PI * 2,
      roofTopY,
    });
  }

  buildHomes() {
    const haloGeometry = new THREE.TorusGeometry(3.15, 0.045, 6, 28);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: '#efd18e',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const groundShadowGeometry = new THREE.CircleGeometry(3.25, 24);
    const groundShadowMaterial = new THREE.MeshBasicMaterial({
      color: '#1b251f',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    homes.forEach((home) => {
      const hasInterior =
        home.isUserHome || (home.group === 'stream' && home.number === 14);
      const source =
        home.group === 'cliff'
          ? this.models.cliffManor
          : home.group === 'forest'
            ? this.models.forestManor
            : this.models.terraceManor;
      const group =
        home.isUserHome || hasInterior ? source.clone() : new THREE.LOD();
      if (!home.isUserHome && !hasInterior) {
        group.addLevel(source.clone(), 0);
        group.addLevel(createManorProxy(home), 62);
      }
      const scale = home.scale * (home.variant === 2 ? 1.16 : 1) * 1.18;
      group.scale.setScalar(scale);
      group.position.set(home.x, home.y + 0.2, home.z);
      group.rotation.y = -home.rotation + Math.PI / 2;
      group.userData = {
        selectionType: 'home',
        home,
      };

      const glassMaterials = [];
      const shellMaterials = [];
      group.traverse((child) => {
        if (!child.isMesh) {
          return;
        }
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.homeId = home.id;
        this.clickableMeshes.push(child);

        const material = child.material;
        const isGlass =
          material?.transparent || material?.color?.getHexString() === '77b9b5';

        if (isGlass) {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color('#d68c4d');
          child.material.emissiveIntensity = 0.1;
          glassMaterials.push(child.material);
        } else if (material) {
          child.material = material.clone();
          const colorHex = material.color?.getHexString();
          const isGreen =
            colorHex === '4b8a5e' ||
            colorHex === '3f774d' ||
            colorHex === '416f45';
          if (!isGreen) {
            const groupWood = {
              cliff: '#b4763d',
              forest: '#8d5930',
              terrace: '#c18444',
              stream: '#a86a38',
            };
            const roofColors = new Set(['62452f', '5e422d', '50382a']);
            child.material.color.set(
              roofColors.has(colorHex)
                ? '#4b2f20'
                : groupWood[home.group] || '#a86a38',
            );
            child.material.roughness = 0.86;
            child.material.metalness = 0;
          }
          if (hasInterior) {
            shellMaterials.push({
              material: child.material,
              opacity: child.material.opacity,
              transparent: child.material.transparent,
              depthWrite: child.material.depthWrite,
            });
          }
        }
      });

      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 3.2, 0.35, 20),
        createWoodMaterial('#ad7f4f'),
      );
      platform.position.set(0, -0.12, 0);
      platform.receiveShadow = true;
      group.add(platform);

      const halo = new THREE.Mesh(haloGeometry, haloMaterial);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.08;
      group.add(halo);

      const groundShadow = new THREE.Mesh(
        groundShadowGeometry,
        groundShadowMaterial,
      );
      groundShadow.rotation.x = -Math.PI / 2;
      groundShadow.position.y = -0.24;
      group.add(groundShadow);

      if (home.variant === 0) {
        const supportMaterial = createWoodMaterial('#6f4b30');
        [-1, 1].forEach((side) => {
          const support = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.16, 3.4, 7),
            supportMaterial,
          );
          support.position.set(side * 1.45, -1.3, -0.95);
          support.rotation.z = side * 0.42;
          group.add(support);
        });
      }

      if (home.variant === 1) {
        const garden = new THREE.Mesh(
          new THREE.SphereGeometry(2.05, 12, 8),
          new THREE.MeshStandardMaterial({
            color: '#3f7448',
            roughness: 1,
          }),
        );
        garden.scale.set(1.15, 0.2, 0.85);
        garden.position.set(0, 2.15, 0);
        group.add(garden);
      }

      if (home.view === 'stream') {
        this.addWaterfrontDeck(home);
      }

      if (home.variant === 2) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(2.1, 0.08, 6, 28),
          new THREE.MeshStandardMaterial({
            color: '#a6e7df',
            emissive: '#82d5d0',
            emissiveIntensity: 0.45,
            roughness: 0.2,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        group.add(ring);

        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(3.6, 0.2, 1.7),
          createWoodMaterial('#a97945'),
        );
        deck.position.set(0, 1.25, 2.15);
        deck.castShadow = true;
        group.add(deck);

        for (const x of [-1.5, 0, 1.5]) {
          const rail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5),
            createWoodMaterial('#765235'),
          );
          rail.position.set(x, 1.85, 2.9);
          group.add(rail);
        }
      }

      if (home.isUserHome) {
        this.userHomeLight = new THREE.PointLight(
          '#ffd89b',
          this.interiorMode ? 4 : 0.5,
          20,
          2,
        );
        this.userHomeLight.position.set(0, 3.2, 0);
        group.add(this.userHomeLight);
      }

      const interiorGroup = hasInterior
        ? this.addSampleInterior(group, home)
        : null;
      this.scene.add(group);
      this.homeObjects.set(home.id, {
        group,
        home,
        glassMaterials,
        interiorGroup,
        shellMaterials,
      });

      const residentName = RESIDENT_PLOTS[home.id];
      if (residentName) {
        this.addResidentBeacon(home, residentName);
      }
    });
  }

  buildCourtyardDetails() {
    const items = {
      fences: [],
      fencePosts: [],
      stones: [],
      gardens: [],
      crops: [],
      barrels: [],
      woodpiles: [],
      basins: [],
      toolRacks: [],
    };
    const groundPoint = (home, angle, radius, height = 0.16) => {
      const x = home.x + Math.cos(angle) * radius;
      const z = home.z + Math.sin(angle) * radius;
      return {
        x,
        y: getTerrainHeight(x, z) + height,
        z,
      };
    };

    homes.forEach((home, index) => {
      const hub = getNearestHub(home);
      const entryAngle = Math.atan2(hub.z - home.z, hub.x - home.x);
      const outwardAngle = Math.atan2(home.z, home.x);
      const side = home.number % 2 === 0 ? -1 : 1;

      for (let step = 0; step < 2; step += 1) {
        const distance = 2.55 + step * 0.75;
        const lateral = (step % 2 === 0 ? -1 : 1) * 0.14 * side;
        const point = groundPoint(home, entryAngle, distance, 0.08);
        items.stones.push({
          x: point.x + Math.cos(entryAngle + Math.PI / 2) * lateral,
          y: point.y,
          z: point.z + Math.sin(entryAngle + Math.PI / 2) * lateral,
          rotation: entryAngle,
          scale: 0.85 + (home.number % 4) * 0.06,
        });
      }

      const fenceAngle = outwardAngle + side * 0.68;
      for (const offset of [-0.58, 0.58]) {
        const angle = fenceAngle + offset;
        const point = groundPoint(home, angle, 3.82, 0.34);
        items.fences.push({
          x: point.x,
          y: point.y,
          z: point.z,
          rotation: angle + Math.PI / 2,
          scale: 0.9 + (home.number % 5) * 0.035,
        });
        items.fencePosts.push({
          x: point.x,
          y: point.y - 0.12,
          z: point.z,
          rotation: angle,
          scale: 1,
        });
      }

      const gardenAngle = outwardAngle - side * 0.82;
      const gardenPoint = groundPoint(home, gardenAngle, 3.5, 0.18);
      items.gardens.push({
        x: gardenPoint.x,
        y: gardenPoint.y,
        z: gardenPoint.z,
        rotation: gardenAngle,
        scale: 0.9 + (home.number % 3) * 0.08,
      });
      for (let crop = 0; crop < 2; crop += 1) {
        const cropAngle = gardenAngle + (crop - 0.5) * 0.28;
        const cropPoint = groundPoint(home, cropAngle, 3.5, 0.35);
        items.crops.push({
          x: cropPoint.x,
          y: cropPoint.y,
          z: cropPoint.z,
          rotation: cropAngle,
          scale: 0.82 + (crop % 2) * 0.2,
        });
      }

      const utilityAngle = outwardAngle + side * 1.45;
      if (index % 3 === 0) {
        const point = groundPoint(home, utilityAngle, 4.35, 0.3);
        items.barrels.push({
          x: point.x,
          y: point.y,
          z: point.z,
          rotation: utilityAngle,
          scale: 1,
        });
      } else if (index % 3 === 1) {
        const point = groundPoint(home, utilityAngle, 4.3, 0.18);
        items.basins.push({
          x: point.x,
          y: point.y,
          z: point.z,
          rotation: utilityAngle,
          scale: 1,
        });
      }

      if (index % 4 === 0) {
        const point = groundPoint(home, outwardAngle - side * 1.38, 4.4, 0.27);
        items.woodpiles.push({
          x: point.x,
          y: point.y,
          z: point.z,
          rotation: outwardAngle,
          scale: 1,
        });
      }

      if (index % 2 === 0) {
        const rackPoint = groundPoint(
          home,
          outwardAngle + side * 1.05,
          4.12,
          0.4,
        );
        items.toolRacks.push({
          x: rackPoint.x,
          y: rackPoint.y,
          z: rackPoint.z,
          rotation: outwardAngle + side * 1.05,
          scale: 1,
        });
      }
    });

    const group = new THREE.Group();
    group.name = 'courtyard-details';
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const addInstances = (geometry, material, list, palette = null) => {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((item, index) => {
        position.set(item.x, item.y, item.z);
        quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0));
        scale.setScalar(item.scale);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        if (palette) {
          color.set(palette[index % palette.length]);
          mesh.setColorAt(index, color);
        }
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    addInstances(
      new THREE.BoxGeometry(1.45, 0.12, 0.12),
      createWoodMaterial('#8d633d'),
      items.fences,
    );
    addInstances(
      new THREE.BoxGeometry(0.12, 0.72, 0.12),
      createWoodMaterial('#68482f'),
      items.fencePosts,
    );
    addInstances(
      new THREE.CylinderGeometry(0.18, 0.22, 0.07, 7),
      new THREE.MeshStandardMaterial({
        color: '#918c7d',
        roughness: 0.98,
      }),
      items.stones,
      ['#918c7d', '#a09a89', '#7f8279'],
    );
    addInstances(
      new THREE.BoxGeometry(1.25, 0.2, 0.72),
      new THREE.MeshStandardMaterial({
        color: '#66513a',
        roughness: 1,
      }),
      items.gardens,
    );
    addInstances(
      new THREE.ConeGeometry(0.075, 0.42, 4),
      new THREE.MeshStandardMaterial({
        color: '#4d8249',
        roughness: 1,
      }),
      items.crops,
      ['#4d8249', '#6b9250', '#3f7446'],
    );
    addInstances(
      new THREE.CylinderGeometry(0.24, 0.29, 0.5, 9),
      createWoodMaterial('#8a5c36'),
      items.barrels,
    );
    addInstances(
      new THREE.BoxGeometry(0.82, 0.34, 0.4),
      createWoodMaterial('#765034'),
      items.woodpiles,
    );
    addInstances(
      new THREE.CylinderGeometry(0.34, 0.28, 0.24, 10),
      new THREE.MeshStandardMaterial({
        color: '#875a3e',
        roughness: 0.92,
      }),
      items.basins,
    );
    addInstances(
      new THREE.BoxGeometry(0.82, 0.76, 0.14),
      createWoodMaterial('#755035'),
      items.toolRacks,
    );

    this.scene.add(group);
  }

  buildStreamDetailPass() {
    const group = new THREE.Group();
    group.name = 'stream-detail-pass';

    // 浅水纹理：水边浅色半透明水带
    const shallowGeometry = createStreamRibbon({
      widthScale: 1.38,
      heightOffset: 0.01,
      colorAt: (z) =>
        new THREE.Color(Math.sin(z * 0.05) > 0.3 ? '#b7e4da' : '#9fd4cb'),
      sampleStep: 2.0,
    });
    const shallow = new THREE.Mesh(
      shallowGeometry,
      new THREE.MeshStandardMaterial({
        color: '#a9dcd3',
        vertexColors: true,
        roughness: 0.32,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shallow.receiveShadow = true;
    group.add(shallow);

    // 小型水草：成簇小草
    let seed = 44771;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const grassGeometry = new THREE.ConeGeometry(0.055, 0.7, 4);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: '#3f7a4c',
      roughness: 1,
    });
    const grassCount = 260;
    const grass = new THREE.InstancedMesh(
      grassGeometry,
      grassMaterial,
      grassCount,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let index = 0; index < grassCount; index += 1) {
      const z = -160 + random() * 320;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * (1.04 + random() * 0.42);
      const y = getTerrainHeight(x, z) + 0.26;
      const size = 0.68 + random() * 0.82;
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
      scale.set(size, size, size);
      matrix.compose(position, quaternion, scale);
      grass.setMatrixAt(index, matrix);
      color.set(
        index % 3 === 0 ? '#3f7a4c' : index % 3 === 1 ? '#2f6b42' : '#57925a',
      );
      grass.setColorAt(index, color);
    }
    grass.receiveShadow = true;
    group.add(grass);

    this.scene.add(group);
  }

  buildRoadDetailPass() {
    const group = new THREE.Group();
    group.name = 'road-detail-pass';

    let seed = 61057;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // 边缘草丛（沿道路/栈道两侧）
    const grassGeometry = new THREE.ConeGeometry(0.05, 0.58, 4);
    const grassMaterial = new THREE.MeshStandardMaterial({
      color: '#4f8249',
      roughness: 1,
    });
    const grassCount = 320;
    const grass = new THREE.InstancedMesh(
      grassGeometry,
      grassMaterial,
      grassCount,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    let placed = 0;
    for (let z = -148; z <= 148 && placed < grassCount; z += 6.5) {
      for (const side of [-1, 1]) {
        if (placed >= grassCount) break;
        const centerZ = z + (random() - 0.5) * 2;
        const width = getStreamWidth(centerZ);
        const x = getStreamX(centerZ) + side * width * (1.5 + random() * 0.36);
        const y = getTerrainHeight(x, centerZ) + 0.16;
        const size = 0.58 + random() * 0.68;
        position.set(x, y, centerZ);
        quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
        scale.set(size * 1.2, size, size);
        matrix.compose(position, quaternion, scale);
        grass.setMatrixAt(placed, matrix);
        color.set(
          placed % 3 === 0 ? '#4f8249' : placed % 3 === 1 ? '#3c6e42' : '#6b9250',
        );
        grass.setColorAt(placed, color);
        placed += 1;
      }
    }
    grass.count = placed;
    grass.receiveShadow = true;
    group.add(grass);

    // 导向标识：木杆 + 标牌
    const postMaterial = createWoodMaterial('#6b4a2f');
    const boardMaterial = createWoodMaterial('#c29a63');
    for (let index = 0; index < 6; index += 1) {
      const z = -120 + index * 46;
      const side = index % 2 === 0 ? -1 : 1;
      const width = getStreamWidth(z);
      const x = getStreamX(z) + side * width * 1.92;
      const groundY = getTerrainHeight(x, z);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 2.1, 6),
        postMaterial,
      );
      post.position.set(x, groundY + 1.05, z);
      post.castShadow = true;
      group.add(post);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.5, 0.1),
        boardMaterial,
      );
      board.position.set(x, groundY + 1.92, z);
      board.castShadow = true;
      group.add(board);

      const arrow = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.14, 0.08),
        postMaterial,
      );
      arrow.position.set(x, groundY + 1.92, z);
      arrow.scale.x = index % 2 === 0 ? 1 : -1;
      group.add(arrow);
    }

    // 溪流/道路周边柔和暖光
    [-78, 0, 78].forEach((z) => {
      const x = getStreamX(z);
      const warm = new THREE.PointLight('#ffe6c2', 0.32, 62, 1.7);
      warm.position.set(x, 9, z);
      group.add(warm);
    });

    this.scene.add(group);
  }

  buildHomeDetailPass() {
    const group = new THREE.Group();
    group.name = 'home-detail-pass';

    const potPositions = [];
    const flowerPositions = [];
    const rackData = [];
    const groundPoint = (home, angle, radius, height = 0.14) => {
      const x = home.x + Math.cos(angle) * radius;
      const z = home.z + Math.sin(angle) * radius;
      return { x, y: getTerrainHeight(x, z) + height, z };
    };

    homes.forEach((home, index) => {
      const hub = getNearestHub(home);
      const entryAngle = Math.atan2(hub.z - home.z, hub.x - home.x);
      const outwardAngle = Math.atan2(home.z, home.x);
      const side = home.number % 2 === 0 ? -1 : 1;

      // 花盆：门口两侧
      for (const lateral of [-0.62, 0.62]) {
        const angle = entryAngle + lateral;
        const point = groundPoint(home, angle, 2.7, 0.12);
        potPositions.push({
          x: point.x,
          y: point.y,
          z: point.z,
          rotation: angle,
          scale: 0.85 + (home.number % 4) * 0.05,
        });
        flowerPositions.push({
          x: point.x,
          y: point.y + 0.27,
          z: point.z,
          scale: 0.8 + (home.number % 5) * 0.06,
        });
      }

      // 晾晒架：每隔 3 户一个
      if (index % 3 === 2) {
        const angle = outwardAngle + side * 1.65;
        const point = groundPoint(home, angle, 3.7, 0.18);
        rackData.push({ x: point.x, y: point.y, z: point.z, rotation: angle });
      }
    });

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    // 花盆
    const potGeometry = new THREE.CylinderGeometry(0.2, 0.16, 0.26, 8);
    const potMaterial = new THREE.MeshStandardMaterial({
      color: '#a0603f',
      roughness: 0.85,
    });
    const pots = new THREE.InstancedMesh(
      potGeometry,
      potMaterial,
      potPositions.length,
    );
    potPositions.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      quaternion.setFromEuler(new THREE.Euler(0, item.rotation, 0));
      scale.setScalar(item.scale);
      matrix.compose(position, quaternion, scale);
      pots.setMatrixAt(index, matrix);
    });
    pots.castShadow = true;
    pots.receiveShadow = true;
    group.add(pots);

    // 花（instanced）
    const flowerPalette = [
      '#e06a6a',
      '#e8a34e',
      '#c86fd0',
      '#e8d04e',
      '#e67a8a',
    ];
    const flowerGeometry = new THREE.SphereGeometry(0.13, 8, 6);
    const flowerMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.55,
    });
    const flowers = new THREE.InstancedMesh(
      flowerGeometry,
      flowerMaterial,
      flowerPositions.length,
    );
    const color = new THREE.Color();
    flowerPositions.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      quaternion.identity();
      scale.setScalar(item.scale);
      matrix.compose(position, quaternion, scale);
      flowers.setMatrixAt(index, matrix);
      color.set(flowerPalette[index % flowerPalette.length]);
      flowers.setColorAt(index, color);
    });
    flowers.castShadow = true;
    group.add(flowers);

    // 晾晒架（木架 + 横杆 + 布）
    const rackWood = createWoodMaterial('#8a5c36');
    const clothColors = ['#c96f5a', '#e0b46b', '#7fae84', '#a58bc4'];
    rackData.forEach((item, index) => {
      const poleGeometry = new THREE.CylinderGeometry(0.055, 0.07, 1.9, 6);
      const crossGeometry = new THREE.BoxGeometry(2.1, 0.08, 0.08);
      const clothGeometry = new THREE.PlaneGeometry(0.7, 0.85, 1, 2);

      [-0.95, 0.95].forEach((offset) => {
        const pole = new THREE.Mesh(poleGeometry, rackWood);
        pole.position.set(
          item.x + Math.sin(item.rotation) * offset,
          item.y + 0.95,
          item.z + Math.cos(item.rotation) * offset,
        );
        pole.castShadow = true;
        group.add(pole);
      });

      const cross = new THREE.Mesh(crossGeometry, rackWood);
      cross.position.set(item.x, item.y + 1.85, item.z);
      cross.rotation.y = item.rotation + Math.PI / 2;
      cross.castShadow = true;
      group.add(cross);

      const cloth = new THREE.Mesh(
        clothGeometry,
        new THREE.MeshStandardMaterial({
          color: clothColors[index % clothColors.length],
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      cloth.position.set(item.x, item.y + 1.4, item.z);
      cloth.rotation.y = item.rotation;
      cloth.castShadow = true;
      group.add(cloth);
    });

    this.scene.add(group);
  }

  addSampleInterior(group, home) {
    const interior = new THREE.Group();
    interior.name = `sample-interior-${home.id}`;
    interior.visible = false;
    const floorMaterial = createWoodMaterial('#9e7043');
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: '#b78c5c',
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const fabricMaterial = new THREE.MeshStandardMaterial({
      color: '#c99b58',
      roughness: 1,
    });
    const ceramicMaterial = new THREE.MeshStandardMaterial({
      color: '#a86945',
      roughness: 0.85,
    });
    const warmLampMaterial = new THREE.MeshStandardMaterial({
      color: '#ffe0a0',
      emissive: '#ffad48',
      emissiveIntensity: 0.45,
      roughness: 0.28,
    });
    this.plazaLights.push(warmLampMaterial);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.1, 2.8),
      floorMaterial,
    );
    floor.position.y = 0.08;
    floor.receiveShadow = true;
    interior.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.85, 0.12),
      wallMaterial,
    );
    backWall.position.set(0, 0.98, -1.36);
    backWall.receiveShadow = true;
    interior.add(backWall);

    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.85, 2.75),
        wallMaterial,
      );
      sideWall.position.set(side * 1.84, 0.98, 0);
      sideWall.receiveShadow = true;
      interior.add(sideWall);
    }

    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 16),
      fabricMaterial,
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.15, 0.15, 0.2);
    rug.scale.set(1.25, 0.9, 1);
    interior.add(rug);

    const bedFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.22, 1.8),
      createWoodMaterial('#725036'),
    );
    bedFrame.position.set(-1.05, 0.25, -0.4);
    bedFrame.castShadow = true;
    interior.add(bedFrame);

    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.24, 1.65),
      new THREE.MeshStandardMaterial({
        color: '#d8c39b',
        roughness: 1,
      }),
    );
    mattress.position.set(-1.05, 0.46, -0.4);
    mattress.castShadow = true;
    interior.add(mattress);

    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.08, 0.86),
      new THREE.MeshStandardMaterial({
        color: '#a96b4c',
        roughness: 1,
      }),
    );
    blanket.position.set(-1.05, 0.62, 0.1);
    blanket.rotation.y = 0.08;
    interior.add(blanket);

    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.14, 0.66),
      createWoodMaterial('#996b40'),
    );
    tableTop.position.set(0.55, 0.74, 0.35);
    tableTop.castShadow = true;
    interior.add(tableTop);
    for (const x of [0.2, 0.9]) {
      for (const z of [0.12, 0.58]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.6, 0.08),
          createWoodMaterial('#68482f'),
        );
        leg.position.set(x, 0.43, z);
        interior.add(leg);
      }
    }

    for (const z of [0.04, 0.66]) {
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.14, 0.42),
        createWoodMaterial('#8d613c'),
      );
      chair.position.set(1.32, 0.42, z);
      chair.castShadow = true;
      interior.add(chair);
    }

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.25, 0.42),
      createWoodMaterial('#7e5636'),
    );
    cabinet.position.set(1.5, 0.7, -0.9);
    cabinet.castShadow = true;
    interior.add(cabinet);

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.12, 0.32),
      createWoodMaterial('#7f5938'),
    );
    shelf.position.set(-0.2, 1.1, -1.08);
    interior.add(shelf);

    const bookColors = ['#8d4d3d', '#3f6d68', '#c09554'];
    for (let index = 0; index < 3; index += 1) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.3, 0.24),
        new THREE.MeshStandardMaterial({
          color: bookColors[index],
          roughness: 0.9,
        }),
      );
      book.position.set(-0.46 + index * 0.18, 1.31, -1.06);
      book.rotation.z = (index - 1) * 0.08;
      interior.add(book);
    }

    for (const offset of [-0.14, 0.08]) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.06, 0.14, 8),
        ceramicMaterial,
      );
      cup.position.set(0.55 + offset, 0.9, 0.34);
      interior.add(cup);
    }

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.12, 0.1, 10),
      ceramicMaterial,
    );
    bowl.position.set(0.72, 0.88, 0.48);
    interior.add(bowl);

    const paddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.5, 0.05),
      createWoodMaterial('#8b5f39'),
    );
    paddle.position.set(-1.62, 0.85, 0.7);
    paddle.rotation.z = -0.12;
    interior.add(paddle);

    for (let index = 0; index < 4; index += 1) {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.02, 0.5, 4),
        new THREE.MeshStandardMaterial({
          color: '#7f8850',
          roughness: 1,
        }),
      );
      stem.position.set(-0.58 + (index - 1.5) * 0.09, 0.88, 1.05);
      stem.rotation.z = (index - 1.5) * 0.08;
      interior.add(stem);
    }

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.14, 0.34, 10),
      ceramicMaterial,
    );
    pot.position.set(-0.58, 0.28, 1.05);
    pot.castShadow = true;
    interior.add(pot);

    const plant = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshStandardMaterial({
        color: '#4e7d48',
        roughness: 1,
      }),
    );
    plant.scale.set(1.25, 0.76, 1);
    plant.position.set(-0.58, 0.6, 1.05);
    interior.add(plant);

    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.2, 0.32, 10),
      new THREE.MeshStandardMaterial({
        color: '#bc9a5e',
        roughness: 1,
      }),
    );
    basket.position.set(0.95, 0.28, -0.95);
    interior.add(basket);

    const oilLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      warmLampMaterial,
    );
    oilLamp.position.set(0.55, 0.92, 0.35);
    interior.add(oilLamp);

    const interiorLight = new THREE.PointLight('#ffd39a', 0.4, 9, 2);
    interiorLight.position.set(0.35, 1.8, 0.2);
    interior.add(interiorLight);
    this.interiorLights.push(interiorLight);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.72, 0.1),
      createWoodMaterial('#68482f'),
    );
    door.position.set(0.95, 0.92, 1.44);
    door.rotation.y = 0.18;
    door.castShadow = true;
    group.add(door);

    const doorHandle = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({
        color: '#d3aa63',
        metalness: 0.35,
        roughness: 0.5,
      }),
    );
    doorHandle.position.set(1.28, 0.92, 1.52);
    group.add(doorHandle);

    const entranceStep = new THREE.Mesh(
      new THREE.BoxGeometry(1.24, 0.16, 0.52),
      createWoodMaterial('#9e7043'),
    );
    entranceStep.position.set(0.95, 0.18, 1.78);
    entranceStep.castShadow = true;
    group.add(entranceStep);

    const signPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.15, 0.1),
      createWoodMaterial('#68482f'),
    );
    signPost.position.set(1.72, 0.64, 1.52);
    signPost.castShadow = true;
    group.add(signPost);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.42, 0.1),
      createWoodMaterial('#b9854d'),
    );
    signBoard.position.set(1.72, 1.16, 1.52);
    signBoard.rotation.y = -0.18;
    signBoard.castShadow = true;
    group.add(signBoard);

    group.add(interior);
    return interior;
  }

  createAvatarObject(avatar, isLocal) {
    const appearance = avatar.appearance || {};
    const bodyColor =
      appearance.bodyColor || avatar.color || getAvatarColor(avatar.userId);
    const hairColor = appearance.hairColor || '#2b2620';
    const group = new THREE.Group();
    group.userData.avatarId = avatar.id;
    group.userData.isLocal = isLocal;
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.72,
    });
    const limbMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.8,
    });

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.72, 4, 8),
      bodyMaterial,
    );
    body.position.y = 0.58;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 12, 8),
      new THREE.MeshStandardMaterial({
        color: '#edc6a0',
        roughness: 0.9,
      }),
    );
    head.position.y = 1.25;
    head.castShadow = true;
    group.add(head);

    const hairMaterial = new THREE.MeshStandardMaterial({
      color: hairColor,
      roughness: 0.85,
    });
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      hairMaterial,
    );
    hair.position.y = 1.3;
    hair.scale.set(1, 0.78, 1);
    hair.castShadow = true;
    group.add(hair);

    const createLimb = ({ x, y, length, radius, material, z = 0 }) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const limb = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, length, 3, 6),
        material,
      );
      limb.position.y = -length / 2;
      limb.castShadow = true;
      pivot.add(limb);
      group.add(pivot);
      return pivot;
    };
    const limbs = {
      leftArm: createLimb({
        x: -0.38,
        y: 0.92,
        length: 0.52,
        radius: 0.075,
        material: bodyMaterial,
      }),
      rightArm: createLimb({
        x: 0.38,
        y: 0.92,
        length: 0.52,
        radius: 0.075,
        material: bodyMaterial,
      }),
      leftLeg: createLimb({
        x: -0.14,
        y: 0.42,
        length: 0.48,
        radius: 0.09,
        material: limbMaterial,
      }),
      rightLeg: createLimb({
        x: 0.14,
        y: 0.42,
        length: 0.48,
        radius: 0.09,
        material: limbMaterial,
      }),
    };

    const label = createAvatarLabel(
      avatar.displayName || avatar.username || '漫游者',
      bodyColor,
    );
    group.add(label);
    group.position.set(
      Number(avatar.x) || 0,
      Number(avatar.y) || 0,
      Number(avatar.z) || 0,
    );
    group.rotation.y = Number(avatar.rotation) || 0;
    this.scene.add(group);
    this.avatarObjects.set(avatar.id, {
      group,
      isLocal,
      body,
      bodyMaterial,
      hairMaterial,
      limbs,
      animationState: avatar.animationState === 'walk' ? 'walk' : 'idle',
      phase: Math.random() * Math.PI * 2,
      targetPosition: new THREE.Vector3(
        Number(avatar.x) || 0,
        Number(avatar.y) || 0,
        Number(avatar.z) || 0,
      ),
      targetRotation: Number(avatar.rotation) || 0,
    });
    return group;
  }

  updateAvatarObject(avatar, isLocal) {
    const record = this.avatarObjects.get(avatar.id);

    if (!record) {
      return this.createAvatarObject(avatar, isLocal);
    }

    if (isLocal && record.isLocal) {
      return record.group;
    }

    record.isLocal = isLocal;
    record.targetPosition.set(
      Number(avatar.x) || 0,
      Number(avatar.y) || 0,
      Number(avatar.z) || 0,
    );
    record.targetRotation = Number(avatar.rotation) || 0;
    record.animationState = avatar.animationState === 'walk' ? 'walk' : 'idle';
    return record.group;
  }

  removeAvatar(avatarId) {
    const record = this.avatarObjects.get(avatarId);

    if (!record) {
      return;
    }

    record.group.traverse((child) => {
      if (!child.isMesh && !child.isSprite) {
        return;
      }

      child.geometry?.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.filter(Boolean).forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
    });
    this.scene.remove(record.group);
    this.avatarObjects.delete(avatarId);
  }

  setLocalAvatar(avatar) {
    if (this.localAvatarId && this.localAvatarId !== avatar.id) {
      this.removeAvatar(this.localAvatarId);
    }

    this.localAppearance = avatar.appearance || this.localAppearance;
    this.localAvatarId = avatar.id;
    this.updateAvatarObject(avatar, true);
  }

  setAppearance(patch) {
    this.localAppearance = {
      bodyColor: patch.bodyColor || this.localAppearance.bodyColor,
      hairColor: patch.hairColor || this.localAppearance.hairColor,
    };
    const record = this.avatarObjects.get(this.localAvatarId);
    if (record) {
      if (record.bodyMaterial) {
        record.bodyMaterial.color.set(this.localAppearance.bodyColor);
      }
      if (record.hairMaterial) {
        record.hairMaterial.color.set(this.localAppearance.hairColor);
      }
    }
  }

  clearLocalAvatar() {
    if (!this.localAvatarId) {
      return;
    }

    this.removeAvatar(this.localAvatarId);
    this.localAvatarId = '';
  }

  setRemoteAvatars(users) {
    const remoteIds = new Set(users.map((user) => user.id).filter(Boolean));

    for (const [avatarId, record] of this.avatarObjects) {
      if (
        !record.isLocal &&
        !record.isRoamingAgent &&
        !remoteIds.has(avatarId)
      ) {
        this.removeAvatar(avatarId);
      }
    }

    users.forEach((user) => {
      if (user.id === this.localAvatarId) {
        return;
      }

      this.updateAvatarObject(user, false);
    });
  }

  getLocalAvatarState() {
    if (!this.localAvatarId) {
      return null;
    }

    const record = this.avatarObjects.get(this.localAvatarId);

    if (!record) {
      return null;
    }

    // 统一使用「实际渲染坐标」group.position：它才是玩家真正站的位置。
    // targetPosition 只是本帧相机中心（目标坐标），在平移/追帧时会与实际渲染点拉开数米，
    // 与居民使用的 group.position 混算会导致贴着居民也判定 >4m。
    return {
      x: record.group.position.x,
      y: record.group.position.y,
      z: record.group.position.z,
      rotation: record.targetRotation,
      animationState: record.animationState,
      appearance: this.localAppearance,
    };
  }

  updateLocalAvatarTransform() {
    if (!this.localAvatarId) {
      return;
    }

    const record = this.avatarObjects.get(this.localAvatarId);

    if (!record) {
      return;
    }

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const x = this.controls.target.x;
    const z = this.controls.target.z;
    const y = getTerrainHeight(x, z);
    const moved = Math.hypot(
      x - record.targetPosition.x,
      z - record.targetPosition.z,
    );
    record.animationState = moved > 0.012 ? 'walk' : 'idle';
    record.targetPosition.set(x, y, z);
    record.targetRotation = Math.atan2(direction.x, direction.z);
  }

  animateAvatars(elapsed, delta) {
    for (const record of this.avatarObjects.values()) {
      const position = record.group.position;
      const target = record.targetPosition;
      const damping = record.isLocal ? 18 : 9;

      position.x = THREE.MathUtils.damp(position.x, target.x, damping, delta);
      position.z = THREE.MathUtils.damp(position.z, target.z, damping, delta);

      const angleDelta = Math.atan2(
        Math.sin(record.targetRotation - record.group.rotation.y),
        Math.cos(record.targetRotation - record.group.rotation.y),
      );
      record.group.rotation.y += angleDelta * Math.min(1, delta * 10);

      const walking = record.animationState === 'walk';
      const cycle = elapsed * (walking ? 7.8 : 1.8) + record.phase;
      const swing = walking ? Math.sin(cycle) * 0.62 : Math.sin(cycle) * 0.06;
      const armSwing = walking
        ? Math.sin(cycle) * 0.48
        : Math.sin(cycle) * 0.045;

      record.limbs.leftLeg.rotation.x = swing;
      record.limbs.rightLeg.rotation.x = -swing;
      record.limbs.leftArm.rotation.x = -armSwing;
      record.limbs.rightArm.rotation.x = armSwing;
      record.body.rotation.z = walking ? Math.sin(cycle * 2) * 0.025 : 0;
      position.y =
        target.y +
        (walking ? Math.abs(Math.sin(cycle)) * 0.055 : Math.sin(cycle) * 0.022);
    }
  }

  getAvatarCount() {
    return this.avatarObjects.size;
  }

  addRoamingAgent({ id, name, appearance, isLord = false, homeId = null }) {
    if (this.avatarObjects.has(id)) {
      return this.avatarObjects.get(id);
    }

    const bodyColor = appearance?.bodyColor || '#2e5f56';
    const hairColor = appearance?.hairColor || '#2b2620';
    const start = { x: 6, z: -2 };
    this.createAvatarObject(
      {
        id,
        username: id,
        displayName: name,
        appearance: { bodyColor, hairColor },
        x: start.x,
        y: getTerrainHeight(start.x, start.z),
        z: start.z,
        rotation: 0,
        animationState: 'idle',
      },
      false,
    );
    const record = this.avatarObjects.get(id);
    record.isRoamingAgent = true;
    record.roaming = {
      idleTimer: 0,
      bounds: { minX: -70, maxX: 95, minZ: -75, maxZ: 85 },
      homeId,
    };
    record.group.position.set(
      start.x,
      getTerrainHeight(start.x, start.z),
      start.z,
    );
    if (homeId) {
      const home = getHomeById(homeId);

      if (home) {
        record.targetPosition.set(home.x, home.y, home.z);
        record.roaming.atHome = true;
      } else {
        this.pickRoamingWaypoint(record);
      }
    } else {
      this.pickRoamingWaypoint(record);
    }
    record.animationState = 'walk';

    if (isLord) {
      this.addLordMarker(record);
    }
    this.roamingAgents.add(id);
    return record;
  }

  addLordMarker(record) {
    const crownMaterial = new THREE.MeshStandardMaterial({
      color: '#e8b74a',
      emissive: '#c98a1e',
      emissiveIntensity: 0.6,
      roughness: 0.32,
      metalness: 0.55,
    });
    const crown = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.045, 8, 24),
      crownMaterial,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.82;
    crown.add(ring);

    for (let index = 0; index < 5; index += 1) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.2, 6),
        crownMaterial,
      );
      const angle = (index / 5) * Math.PI * 2;
      spike.position.set(
        Math.cos(angle) * 0.21,
        1.94,
        Math.sin(angle) * 0.21,
      );
      crown.add(spike);
    }
    record.group.add(crown);
    record.lordMarker = crown;
  }

  pickRoamingWaypoint(record) {
    const { minX, maxX, minZ, maxZ } = record.roaming.bounds;
    const homeId = record.roaming.homeId;

    if (homeId && Math.random() < 0.45) {
      const home = getHomeById(homeId);

      if (home) {
        record.targetPosition.set(home.x, home.y, home.z);
        record.targetRotation = Math.atan2(
          home.x - record.group.position.x,
          home.z - record.group.position.z,
        );
        record.roaming.atHome = true;
        return;
      }
    }

    const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
    record.targetPosition.set(x, getTerrainHeight(x, z), z);
    record.targetRotation = Math.atan2(
      x - record.group.position.x,
      z - record.group.position.z,
    );
    record.roaming.atHome = false;
  }

  getRoamingAgentPosition(id) {
    const record = this.avatarObjects.get(id);

    if (!record || !record.isRoamingAgent) {
      return null;
    }

    return {
      x: record.group.position.x,
      y: record.group.position.y,
      z: record.group.position.z,
    };
  }

  updateRoamingAgents(delta) {
    for (const record of this.avatarObjects.values()) {
      if (!record.isRoamingAgent) {
        continue;
      }

      const roaming = record.roaming;

      if (roaming.idleTimer > 0) {
        roaming.idleTimer -= delta;
        record.animationState = 'idle';
        continue;
      }

      const dx = record.targetPosition.x - record.group.position.x;
      const dz = record.targetPosition.z - record.group.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance < 1.6) {
        record.animationState = 'idle';
        roaming.idleTimer = roaming.atHome
          ? 5 + Math.random() * 3
          : 0.8 + Math.random() * 1.5;
        this.pickRoamingWaypoint(record);
        continue;
      }

      record.animationState = 'walk';
      record.targetRotation = Math.atan2(dx, dz);
    }
  }

  addResidentAvatar(resident) {
    const record = this.addRoamingAgent({
      id: resident.avatarId,
      name: resident.residentName,
      appearance: {
        bodyColor: resident.avatarColor || '#4f8f7b',
        hairColor: resident.hairColor || '#2b2620',
      },
      isLord: false,
      homeId: resident.homePlotId,
    });

    record.isResident = true;
    record.residentId = resident.avatarId;
    record.residentName = resident.residentName || '居民';
    record.residentHomePlotId = resident.homePlotId;

    const home = getHomeById(resident.homePlotId);

    if (home) {
      const radius = 2.3;
      record.roaming.bounds = {
        minX: home.x - radius,
        maxX: home.x + radius,
        minZ: home.z - radius,
        maxZ: home.z + radius,
      };
      record.roaming.homeId = resident.homePlotId;
      record.group.position.set(home.x, home.y, home.z);
      record.targetPosition.set(home.x, home.y, home.z);
      record.roaming.atHome = true;
      record.roaming.idleTimer = 1 + Math.random();
    }

    return record;
  }

  getResidentAvatarStates() {
    const states = [];

    for (const record of this.avatarObjects.values()) {
      if (!record.isResident) {
        continue;
      }

      states.push({
        avatarId: record.residentId,
        residentName: record.residentName || '',
        homePlotId: record.residentHomePlotId || '',
        x: record.group.position.x,
        y: record.group.position.y,
        z: record.group.position.z,
        rotation: record.group.rotation.y,
        currentState: record.animationState === 'walk' ? 'walk' : 'idle',
      });
    }

    return states;
  }

  restoreResidentAvatarStates(states) {
    if (!Array.isArray(states)) {
      return;
    }

    for (const state of states) {
      const record = this.avatarObjects.get(state.avatarId);

      if (!record || !record.isResident) {
        continue;
      }

      if (Number.isFinite(state.x)) {
        record.group.position.x = state.x;
      }
      if (Number.isFinite(state.y)) {
        record.group.position.y = state.y;
      }
      if (Number.isFinite(state.z)) {
        record.group.position.z = state.z;
      }
      if (Number.isFinite(state.rotation)) {
        record.group.rotation.y = state.rotation;
      }
      record.targetPosition.set(
        Number.isFinite(state.x) ? state.x : record.group.position.x,
        Number.isFinite(state.y) ? state.y : record.group.position.y,
        Number.isFinite(state.z) ? state.z : record.group.position.z,
      );
      record.animationState = state.currentState === 'walk' ? 'walk' : 'idle';
    }
  }

  getResidentsNearLocal(distance = 4) {
    const local = this.getLocalAvatarState();

    if (!local) {
      return [];
    }

    const near = [];

    for (const record of this.avatarObjects.values()) {
      if (!record.isResident) {
        continue;
      }

      const gap = Math.hypot(
        record.group.position.x - local.x,
        record.group.position.z - local.z,
      );

      if (gap <= distance) {
        near.push({
          avatarId: record.residentId,
          residentName: record.residentName || '居民',
          distance: gap,
        });
      }
    }

    return near.sort((left, right) => left.distance - right.distance);
  }

  addWaterfrontDeck(home) {
    let nearest = null;

    for (let z = -96; z <= 96; z += 2) {
      const x = getStreamX(z);
      const distance = Math.hypot(home.x - x, home.z - z);

      if (!nearest || distance < nearest.distance) {
        nearest = {
          x,
          z,
          distance,
        };
      }
    }

    const direction = new THREE.Vector3(
      nearest.x - home.x,
      0,
      nearest.z - home.z,
    ).normalize();
    const deckPosition = new THREE.Vector3(
      home.x,
      home.y + 0.42,
      home.z,
    ).addScaledVector(direction, Math.min(3.8, nearest.distance * 0.42));
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.24, 1.45),
      createWoodMaterial('#a77a4b'),
    );
    deck.position.copy(deckPosition);
    deck.rotation.y = Math.atan2(direction.x, direction.z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.scene.add(deck);

    for (const lateral of [-0.95, 0.95]) {
      const postX =
        deckPosition.x +
        Math.cos(Math.atan2(direction.x, direction.z)) * lateral;
      const postZ =
        deckPosition.z -
        Math.sin(Math.atan2(direction.x, direction.z)) * lateral;
      const groundY = getTerrainHeight(postX, postZ);
      const height = Math.max(0.35, deckPosition.y - groundY);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, height, 6),
        createWoodMaterial('#694a31'),
      );
      post.position.set(postX, groundY + height / 2, postZ);
      post.castShadow = true;
      this.scene.add(post);
    }

    for (let step = 0; step < 2; step += 1) {
      const stepPosition = deckPosition
        .clone()
        .addScaledVector(direction, 1.2 + step * 0.72);
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.18, 0.65),
        new THREE.MeshStandardMaterial({
          color: '#8b8b7b',
          roughness: 0.95,
        }),
      );
      stone.position.copy(stepPosition);
      stone.position.y =
        getTerrainHeight(stepPosition.x, stepPosition.z) + 0.32;
      stone.rotation.y = Math.atan2(direction.x, direction.z);
      stone.receiveShadow = true;
      this.scene.add(stone);
    }

    if (nearest.distance < 11) {
      const dockPosition = new THREE.Vector3(
        nearest.x,
        getTerrainHeight(nearest.x, nearest.z) + 0.58,
        nearest.z,
      ).addScaledVector(direction, -getStreamWidth(nearest.z) * 0.18);
      const dock = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 0.18, 0.9),
        createWoodMaterial('#b88a57'),
      );
      dock.position.copy(dockPosition);
      dock.rotation.y = Math.atan2(direction.x, direction.z);
      dock.castShadow = true;
      this.scene.add(dock);

      for (const side of [-1, 1]) {
        const pile = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.13, 1.35, 6),
          createWoodMaterial('#5d4330'),
        );
        pile.position
          .copy(dockPosition)
          .addScaledVector(
            new THREE.Vector3(
              Math.cos(Math.atan2(direction.x, direction.z)),
              0,
              -Math.sin(Math.atan2(direction.x, direction.z)),
            ),
            side * 0.78,
          );
        pile.position.y += 0.32;
        pile.castShadow = true;
        this.scene.add(pile);
      }

      if (home.number % 3 === 0) {
        const boat = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.34, 1.4, 5, 8),
          createWoodMaterial('#8d633d'),
        );
        boat.rotation.z = Math.PI / 2;
        boat.rotation.y = Math.atan2(direction.x, direction.z);
        boat.scale.set(1, 0.55, 1);
        boat.position.copy(dockPosition).addScaledVector(direction, -1.15);
        boat.position.y -= 0.08;
        boat.castShadow = true;
        this.scene.add(boat);
      }
    }
  }

  buildClouds() {
    const material = new THREE.MeshBasicMaterial({
      color: '#e8f2ef',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      fog: true,
    });
    this.cloudMaterial = material;

    for (let index = 0; index < 12; index += 1) {
      const cloud = new THREE.Group();
      const count = 3 + (index % 3);

      for (let puff = 0; puff < count; puff += 1) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 8, 6),
          material,
        );
        mesh.scale.set(8 + puff * 1.4, 2.2, 3.5 + puff * 0.5);
        mesh.position.x = puff * 6;
        cloud.add(mesh);
      }

      const angle = (index / 12) * Math.PI * 2;
      const radius = 42 + (index % 4) * 12;
      cloud.position.set(
        Math.cos(angle) * radius,
        20 + (index % 3) * 4,
        Math.sin(angle) * radius,
      );
      cloud.userData.speed = 0.14 + (index % 3) * 0.04;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  buildAtmospherePass() {
    // —— 远景山林：第二层远山（更远、更淡）——
    const farMountainMaterials = [
      new THREE.MeshStandardMaterial({ color: '#5f7664', roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: '#6f8473', roughness: 1 }),
    ];
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2 + 0.45;
      const radius = 216 + (index % 3) * 20;
      const height = 32 + (index % 4) * 7;
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(28 + (index % 4) * 7, height, 9),
        farMountainMaterials[index % 2],
      );
      mountain.position.set(
        Math.cos(angle) * radius,
        getTerrainHeight(Math.cos(angle) * radius, Math.sin(angle) * radius) +
          height / 2 -
          4,
        Math.sin(angle) * radius,
      );
      mountain.rotation.y = angle;
      mountain.receiveShadow = true;
      this.scene.add(mountain);
    }

    // —— 树林层次：中远景深色林带剪影 ——
    let seed = 33601;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const silhouetteGeometry = new THREE.ConeGeometry(2.7, 10, 6);
    const silhouetteMaterial = new THREE.MeshStandardMaterial({
      color: '#2e5940',
      roughness: 1,
    });
    const silhouetteCount = 96;
    const silhouettes = new THREE.InstancedMesh(
      silhouetteGeometry,
      silhouetteMaterial,
      silhouetteCount,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let placed = 0;
    while (placed < silhouetteCount) {
      const angle = random() * Math.PI * 2;
      const radius = 122 + random() * 34;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x - getStreamX(z)) < 8) continue;
      const y = getTerrainHeight(x, z);
      position.set(x, y + 2.6, z);
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI, 0));
      const s = 0.8 + random() * 0.6;
      scale.set(s, s * (0.9 + random() * 0.4), s);
      matrix.compose(position, quaternion, scale);
      silhouettes.setMatrixAt(placed, matrix);
      placed += 1;
    }
    silhouettes.receiveShadow = true;
    this.scene.add(silhouettes);

    // —— 大气云雾：分层远景雾墙 ——
    [0.06, 0.1].forEach((opacity, layer) => {
      const radius = 188 + layer * 52;
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 52, 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#d8ece6',
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      wall.position.y = 24;
      this.scene.add(wall);
    });

    // —— 环境点缀：落叶粒子 ——
    const leafCount = 170;
    const leafPositions = new Float32Array(leafCount * 3);
    this.leafVelocities = [];
    for (let index = 0; index < leafCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 16 + random() * 150;
      leafPositions[index * 3] = Math.cos(angle) * radius;
      leafPositions[index * 3 + 1] = 5 + random() * 16;
      leafPositions[index * 3 + 2] = Math.sin(angle) * radius;
      this.leafVelocities.push({
        fall: 0.5 + random() * 1.1,
        drift: (random() - 0.5) * 1.1,
        phase: random() * Math.PI * 2,
      });
    }
    const leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(leafPositions, 3),
    );
    const leafMaterial = new THREE.PointsMaterial({
      color: '#c9a24a',
      size: 0.34,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.leafPoints = new THREE.Points(leafGeometry, leafMaterial);
    this.scene.add(this.leafPoints);

    // —— 环境点缀：飞鸟粒子 ——
    this.birds = [];
    const wingGeometry = new THREE.PlaneGeometry(0.85, 0.26);
    const wingMaterial = new THREE.MeshBasicMaterial({
      color: '#4a5148',
      side: THREE.DoubleSide,
      fog: false,
    });
    for (let index = 0; index < 7; index += 1) {
      const bird = new THREE.Group();
      const left = new THREE.Mesh(wingGeometry, wingMaterial);
      left.rotation.z = -0.32;
      left.position.x = -0.26;
      const right = new THREE.Mesh(wingGeometry, wingMaterial);
      right.rotation.z = 0.32;
      right.position.x = 0.26;
      bird.add(left, right);
      bird.userData = {
        radius: 58 + index * 14,
        height: 27 + index * 3.2,
        speed: 0.11 + (index % 3) * 0.028,
        phase: (index / 7) * Math.PI * 2,
      };
      this.birds.push(bird);
      this.scene.add(bird);
    }
  }

  buildNightSky() {
    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48;
      const radius = 290;
      positions[index * 3] = Math.cos(theta) * Math.sin(phi) * radius;
      positions[index * 3 + 1] = Math.cos(phi) * radius;
      positions[index * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const material = new THREE.PointsMaterial({
      color: '#dfeaff',
      size: 0.9,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(geometry, material);
    this.stars.visible = false;
    this.scene.add(this.stars);
  }

  buildFireflies() {
    const count = 130;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 14 + Math.random() * 120;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = 1.2 + Math.random() * 4.5;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const material = new THREE.PointsMaterial({
      color: '#ffe27a',
      size: 0.32,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireflies = new THREE.Points(geometry, material);
    this.fireflies.visible = false;
    this.scene.add(this.fireflies);
  }

  buildRain() {
    const count = 480;
    const positions = new Float32Array(count * 3);
    this.rainVelocities = [];
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 300;
      positions[index * 3 + 1] = Math.random() * 32;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 300;
      this.rainVelocities.push(15 + Math.random() * 9);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const material = new THREE.PointsMaterial({
      color: '#bcd6e8',
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.rain = new THREE.Points(geometry, material);
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  setWeather(weather) {
    this.weather = clamp(Math.round(Number(weather) || 0), 0, 2);
    this.weatherTimer = 0;
  }

  updateWeather(delta) {
    // 自动轮换
    if (this.autoWeather) {
      this.weatherTimer += delta;
      if (this.weatherTimer >= this.weatherInterval) {
        this.weatherTimer = 0;
        this.weather = (this.weather + 1) % 3;
      }
    }

    const isRain = this.weather === 1 || this.weather === 2;
    const isOvercast = this.weather === 2;

    // 雨滴粒子下落
    if (this.rain) {
      this.rain.visible = isRain;
      if (isRain) {
        const pos = this.rain.geometry.attributes.position;
        for (let index = 0; index < this.rainVelocities.length; index += 1) {
          const speed = this.rainVelocities[index];
          pos.setY(index, pos.getY(index) - speed * delta);
          if (pos.getY(index) < 0) {
            pos.setY(index, 30 + Math.random() * 6);
            pos.setX(index, (Math.random() - 0.5) * 300);
            pos.setZ(index, (Math.random() - 0.5) * 300);
          }
        }
        pos.needsUpdate = true;
      }
    }

    // 湿地面反光：降低粗糙度、提高金属度
    if (this.terrainMaterial) {
      this.terrainMaterial.roughness = isRain ? 0.52 : 0.95;
    }
    if (this.plazaDeckMaterial) {
      this.plazaDeckMaterial.roughness = isRain ? 0.38 : 0.94;
      this.plazaDeckMaterial.metalness = isRain ? 0.18 : 0.02;
    }

    // 阴雨薄雾：加厚雾 + 压暗 + 去饱和
    if (isOvercast) {
      this.sun.intensity *= 0.55;
      this.hemisphere.intensity *= 0.72;
      this.fillLight.intensity *= 0.8;
      if (this.fogEnabled && this.scene.fog) {
        this.scene.fog.near = 92;
        this.scene.fog.far = 252;
        const nightTint = (this.nightBlend || 0) > 0.5;
        this.scene.fog.color.set(nightTint ? '#4a5560' : '#93a09c');
      }
    } else if (this.fogEnabled && this.scene.fog) {
      this.scene.fog.near = isRain ? 138 : 158;
      this.scene.fog.far = isRain ? 310 : 330;
    }
  }

  pick(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.clickableMeshes, false)[0];

    if (!hit) {
      return;
    }

    const object = hit.object;

    if (object.userData.selectionType === 'residentHome') {
      this.onSelect({
        type: 'residentHome',
        residentName: object.userData.residentName,
        homeId: object.userData.homeId,
        title: `${object.userData.residentName}的家`,
        description: `原住民 ${object.userData.residentName} 的宅院 · ${object.userData.homeId}`,
      });
      return;
    }

    if (object.userData.selectionType === 'center') {
      this.onSelect({
        type: 'center',
        title: '生活广场',
        description:
          '环形木构公共空间，包含露天剧场、多层平台、中央水景与观景连廊。',
      });
      return;
    }

    const homeId = object.userData.homeId;
    const home = getHomeById(homeId);

    if (home) {
      this.selectedHomeId = home.id;
      this.onSelect({
        type: 'home',
        id: home.id,
        number: home.number,
        title: `生态庄园 ${home.number}`,
        view: home.view,
        description: `${home.view === 'stream' ? '溪水' : home.view === 'cliff' ? '悬崖' : home.view === 'plaza' ? '广场全景' : '森林'}景观生态庄园`,
      });
    }
  }

  moveCamera(delta) {
    const speed = this.keys.has('ShiftLeft') ? 18 : 9;
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0));
    const movement = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      movement.add(direction);
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      movement.sub(direction);
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      movement.add(right);
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      movement.sub(right);
    }

    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed * delta);
      this.camera.position.add(movement);
      this.controls.target.add(movement);
    }
  }

  updateDayMode(delta) {
    // 时间自动匀速流动（24 小时循环）
    if (this.autoDayCycle) {
      this.timeOfDay = (this.timeOfDay + delta * this.dayCycleSpeed) % 24;
    }

    const t = this.timeOfDay;
    const sunAngle = ((t - 6) / 12) * Math.PI;
    const sunElevation = Math.sin(sunAngle);
    const daylight = clamp(sunElevation, 0, 1);
    const night = 1 - daylight;
    const dusk = clamp(1 - Math.abs(sunElevation - 0.18) * 5, 0, 1);

    this.dayTarget = daylight;
    this.dayBlend = THREE.MathUtils.damp(this.dayBlend, daylight, 1.6, delta);
    const blend = this.dayBlend;
    const nightBlend = 1 - blend;
    this.nightBlend = nightBlend;

    // 太阳位置（东升西落）
    this.sun.position.set(
      Math.cos(sunAngle) * 84,
      Math.max(0, sunElevation) * 90,
      42,
    );

    // 太阳颜色：正午暖白 → 日出/黄昏暖橙 → 夜晚冷蓝
    this.sun.color
      .set('#ffe0ae')
      .lerp(new THREE.Color('#ff8a3c'), dusk * 0.8)
      .lerp(new THREE.Color('#274060'), night);

    // 天光颜色：白天暖白 → 夜晚冷蓝
    this.hemisphere.color
      .set('#fff0cf')
      .lerp(new THREE.Color('#6d8db0'), nightBlend * 0.85);

    this.hemisphere.intensity = 0.45 + blend * 1.9;
    this.sun.intensity = 0.05 + blend * 3.3;
    this.fillLight.intensity = 0.22 + blend * 0.56;
    this.centralPointLight.intensity = 0.4 + nightBlend * 3.4;
    this.centralCore.material.emissiveIntensity = 0.16 + nightBlend * 1.2;
    [...this.plazaLights, ...this.walkwayLights].forEach((material) => {
      material.emissiveIntensity = 0.1 + nightBlend * 1.65;
    });
    this.corridorLights.forEach((material, index) => {
      material.emissiveIntensity =
        0.08 + nightBlend * (1.28 + (index % 3) * 0.12);
    });
    this.interiorLights.forEach((light) => {
      light.intensity =
        (this.interiorMode ? 2.7 : 0.12) * (0.55 + nightBlend * 0.85);
    });
    if (this.plazaFireLight) {
      this.plazaFireLight.intensity = 0.55 + nightBlend * 3.8;
      this.plazaFireLight.distance = 32 + nightBlend * 8;
    }
    this.scene.background.set(blend > 0.5 ? '#d4e8e5' : '#1b2d43');
    if (this.fogEnabled && this.scene.fog) {
      this.scene.fog.color.set(blend > 0.5 ? '#d8ece6' : '#35495b');
      this.scene.fog.near = 158;
      this.scene.fog.far = 330;
    }

    this.homeObjects.forEach(({ glassMaterials }) => {
      glassMaterials.forEach((material) => {
        material.emissiveIntensity = 0.12 + nightBlend * 1.15;
      });
    });

    if (this.userHomeLight) {
      this.userHomeLight.intensity =
        (this.interiorMode ? 3.2 : 0.45) * (0.6 + nightBlend * 0.8);
    }

    if (this.waterMaterials.length) {
      this.waterMaterials.forEach((material) => {
        material.envMapIntensity = 0.16 + nightBlend * 0.28;
        material.opacity = 0.72 + nightBlend * 0.08;
      });
    }

    // 星空：夜晚显现
    if (this.stars) {
      this.stars.visible = blend < 0.55;
      this.stars.material.opacity = clamp(nightBlend * 1.4, 0, 1);
    }

    // 萤火虫：夜晚显现，柔和脉动
    if (this.fireflies) {
      this.fireflies.visible = blend < 0.6;
      const pulse = 0.65 + 0.35 * Math.sin(this.clock.elapsedTime * 2.4);
      this.fireflies.material.opacity = clamp(nightBlend * 1.7 * pulse, 0, 1);
    }

    // 环境粒子亮度随环境衰减：云雾、落叶、飞鸟
    if (this.cloudMaterial) {
      this.cloudMaterial.opacity = 0.15 * (0.3 + blend * 0.7);
    }
    if (this.leafPoints) {
      this.leafPoints.material.opacity = 0.65 * (0.25 + blend * 0.75);
    }
    this.birds.forEach((bird) => {
      bird.traverse((child) => {
        if (child.isMesh) child.material.opacity = 0.3 + blend * 0.7;
      });
    });
  }

  refreshStreamReflection() {
    if (!this.streamCubeCamera || !this.streamSurface) {
      return;
    }

    this.streamSurface.visible = false;
    this.streamCubeCamera.update(this.renderer, this.scene);
    this.streamSurface.visible = true;
  }

  animateFly(time) {
    const animation = this.flyAnimation;

    if (!animation) {
      return;
    }

    const progress = clamp(
      (time - animation.startedAt) / animation.duration,
      0,
      1,
    );
    const eased = progress * progress * (3 - 2 * progress);
    const point = animation.curve.getPointAt(eased);
    this.camera.position.copy(point);
    this.controls.target.lerp(animation.target, 0.1);

    if (progress >= 1) {
      this.controls.target.copy(animation.target);
      this.camera.lookAt(animation.target);
      this.controls.update();
      this.flyAnimation = null;
    }
  }

  animate = () => {
    if (!this.running) {
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.moveCamera(delta);
    this.controls.update();
    this.updateDayMode(delta);
    this.updateWeather(delta);
    this.updateLocalAvatarTransform();
    this.updateRoamingAgents(delta);
    this.animateAvatars(elapsed, delta);
    this.animateFly(performance.now());

    if (this.forestCanopyMaterial?.userData.windUniform) {
      this.forestCanopyMaterial.userData.windUniform.value =
        elapsed * (this.windEnabled ? 1 : 0.1);
    }

    if (this.waterMaterials.length) {
      this.waterMaterials.forEach((material) => {
        material.userData.waterUniform.value = elapsed;
      });
    }

    this.streamRipples.forEach((ripple, index) => {
      const wave = 1 + Math.sin(elapsed * 1.8 + ripple.userData.phase) * 0.32;
      ripple.scale.setScalar(wave);
      ripple.material.opacity =
        0.08 + (0.5 + 0.5 * Math.sin(elapsed * 2.2 + index)) * 0.13;
    });

    this.residentBeacons.forEach((beacon) => {
      // 暖黄小灯笼：白天不发光（光晕/点光为 0），傍晚/夜间随 nightBlend 自动亮起，带轻微烛火呼吸。
      const night = this.nightBlend || 0;
      const flicker = 0.9 + 0.1 * Math.sin(elapsed * 3.1 + beacon.phase);
      beacon.haloMaterial.opacity = 0.5 * night * flicker;
      beacon.light.intensity = 1.0 * night * flicker;
      beacon.paperMaterial.color
        .copy(LANTERN_DAY_COLOR)
        .lerp(LANTERN_WARM_COLOR, night * flicker);
    });

    this.waterfallMaterials?.forEach((material, index) => {
      material.opacity =
        0.3 + (0.5 + 0.5 * Math.sin(elapsed * 3.1 + index)) * 0.18;
    });

    this.clouds.forEach((cloud, index) => {
      cloud.position.x += cloud.userData.speed * delta;
      cloud.position.z += Math.sin(elapsed * 0.08 + index) * delta * 0.08;

      if (cloud.position.x > 170) {
        cloud.position.x = -170;
      }
    });

    // 落叶飘落
    if (this.leafPoints) {
      const leafPos = this.leafPoints.geometry.attributes.position;
      for (let index = 0; index < this.leafVelocities.length; index += 1) {
        const leaf = this.leafVelocities[index];
        leafPos.setY(index, leafPos.getY(index) - leaf.fall * delta);
        leafPos.setX(
          index,
          leafPos.getX(index) +
            Math.sin(elapsed * 0.8 + leaf.phase) * delta * leaf.drift,
        );
        if (leafPos.getY(index) < 0.8) {
          leafPos.setY(index, 14 + Math.random() * 12);
          leafPos.setX(index, (Math.random() - 0.5) * 260);
          leafPos.setZ(index, (Math.random() - 0.5) * 260);
        }
      }
      leafPos.needsUpdate = true;
    }

    // 飞鸟循环飞行
    this.birds.forEach((bird) => {
      const data = bird.userData;
      data.phase += delta * data.speed;
      bird.position.set(
        Math.cos(data.phase) * data.radius,
        data.height + Math.sin(data.phase * 1.7) * 1.6,
        Math.sin(data.phase) * data.radius,
      );
      bird.rotation.y = -data.phase;
    });

    this.renderer.render(this.scene, this.camera);
    this.frameCount += 1;

    if (this.frameCount % 24 === 0) {
      this.onStats({
        hills: 1,
        homes: this.homeObjects.size,
        bridges: bridgeNetwork.length + crossGroupBridges.length + homes.length,
        trees: this.treeCount || 750,
      });
    }

    if (
      this.reflectionDirty &&
      Math.abs(this.dayBlend - this.dayTarget) < 0.035 &&
      this.frameCount % 20 === 0
    ) {
      this.refreshStreamReflection();
      this.reflectionDirty = false;
    }
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  updateProgress(value, message) {
    this.onProgress({
      progress: value,
      message,
    });
  }

  getHomeHome() {
    return homes.find((home) => home.isUserHome);
  }

  flyToHome(homeId) {
    const home = getHomeById(homeId) || this.getHomeHome();
    const hub = getNearestHub(home);
    const start = this.camera.position.clone();
    const center = new THREE.Vector3(0, 24, 0);
    const hubPoint = new THREE.Vector3(hub.x, hub.y + 7, hub.z);
    const outward = new THREE.Vector3(home.x, 0, home.z).normalize();
    const target = new THREE.Vector3(home.x, home.y + 2.4, home.z);
    const end = target
      .clone()
      .add(outward.multiplyScalar(24))
      .add(new THREE.Vector3(0, 19, 0));
    const curve = new THREE.CatmullRomCurve3([
      start,
      start
        .clone()
        .lerp(center, 0.42)
        .add(new THREE.Vector3(0, 12, 0)),
      center,
      hubPoint,
      end,
    ]);

    this.flyAnimation = {
      curve,
      startedAt: performance.now(),
      duration: 2600,
      target,
    };
    this.selectedHomeId = home.id;
    this.overviewMode = false;
    this.onSelect({
      type: 'home',
      id: home.id,
      number: home.number,
      title: `生态庄园 ${home.number}`,
      view: home.view,
      description: '镜头正沿木构连廊前往你的私人庄园。',
    });
  }

  flyToCenter() {
    const start = this.camera.position.clone();
    const end = new THREE.Vector3(28, 24, 34);
    const curve = new THREE.CatmullRomCurve3([
      start,
      start
        .clone()
        .lerp(end, 0.5)
        .add(new THREE.Vector3(0, 16, 0)),
      end,
    ]);
    this.flyAnimation = {
      curve,
      startedAt: performance.now(),
      duration: 1900,
      target: new THREE.Vector3(0, 2, 0),
    };
    this.overviewMode = false;
  }

  flyToOverview() {
    const start = this.camera.position.clone();
    const end = new THREE.Vector3(0, 180, 176);
    const middle = start
      .clone()
      .lerp(end, 0.55)
      .add(new THREE.Vector3(0, 48, 0));
    const curve = new THREE.CatmullRomCurve3([start, middle, end]);
    this.flyAnimation = {
      curve,
      startedAt: performance.now(),
      duration: 2800,
      target: new THREE.Vector3(0, 0, 0),
    };
    this.overviewMode = true;
    this.onSelect({
      type: 'overview',
      title: '城镇全景',
      description:
        '俯瞰临溪、森林、悬崖和台地四个庄园组团，以及中心木构生活广场。',
    });
  }

  setDayMode(dayMode) {
    this.timeOfDay = dayMode ? 11.5 : 21.5;
    this.reflectionDirty = true;
  }

  setTimePeriod(period) {
    const hours = { dawn: 6.3, day: 11.5, dusk: 17.6, night: 21.5 };
    this.timeOfDay = hours[period] ?? 11.5;
    this.reflectionDirty = true;
  }

  setFogEnabled(enabled) {
    this.fogEnabled = enabled;
    this.scene.fog = enabled
      ? new THREE.Fog(this.dayBlend > 0.5 ? '#d8ece6' : '#35495b', 158, 330)
      : null;
  }

  setWindEnabled(enabled) {
    this.windEnabled = enabled;
  }

  setInteriorMode(enabled) {
    this.interiorMode = enabled;
    this.homeObjects.forEach(
      ({ glassMaterials, interiorGroup, shellMaterials }) => {
        glassMaterials.forEach((material) => {
          material.opacity = enabled ? 0.36 : 0.72;
        });
        if (interiorGroup) {
          interiorGroup.visible = enabled;
        }
        shellMaterials.forEach((entry) => {
          entry.material.transparent = enabled ? true : entry.transparent;
          entry.material.opacity = enabled ? 0.2 : entry.opacity;
          entry.material.depthWrite = enabled ? false : entry.depthWrite;
          entry.material.needsUpdate = true;
        });
      },
    );

    if (this.userHomeLight) {
      this.userHomeLight.intensity = enabled ? 3.2 : 0.45;
    }
    this.interiorLights.forEach((light) => {
      light.intensity = enabled ? 2.7 : 0.12;
    });
  }

  resetView() {
    this.flyAnimation = null;
    this.overviewMode = false;
    this.camera.position.set(82, 82, 96);
    this.controls.target.set(0, 2, 0);
    this.controls.update();
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.renderer.domElement.removeEventListener(
      'pointerup',
      this.handlePointerUp,
    );
    this.renderer.domElement.removeEventListener(
      'pointermove',
      this.handlePointerMove,
    );
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
