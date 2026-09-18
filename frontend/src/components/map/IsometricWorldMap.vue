<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  GRID_EXTENT,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isoToWorld,
  scenePoints,
} from './mapData.js';

defineProps({
  expanded: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select', 'update:expanded']);
const canvasHost = ref(null);
const canvas = ref(null);
let resizeObserver;
let animationFrame = 0;

const gridLineCoordinates = Array.from(
  { length: GRID_EXTENT * 2 + 1 },
  (_, index) => index - GRID_EXTENT,
);

const groundPolygon = computed(() => {
  const corners = [
    isoToWorld(-GRID_EXTENT, -GRID_EXTENT),
    isoToWorld(GRID_EXTENT, -GRID_EXTENT),
    isoToWorld(GRID_EXTENT, GRID_EXTENT),
    isoToWorld(-GRID_EXTENT, GRID_EXTENT),
  ];

  return corners.map(({ x, y }) => `${x},${y}`).join(' ');
});

const drawGrid = () => {
  const host = canvasHost.value;
  const element = canvas.value;

  if (!host || !element) {
    return;
  }

  const { width, height } = host.getBoundingClientRect();

  if (!width || !height) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.round(width);
  const displayHeight = Math.round(height);

  if (
    element.width !== Math.round(displayWidth * dpr) ||
    element.height !== Math.round(displayHeight * dpr)
  ) {
    element.width = Math.round(displayWidth * dpr);
    element.height = Math.round(displayHeight * dpr);
  }

  const context = element.getContext('2d');
  const scale = Math.min(
    displayWidth / WORLD_WIDTH,
    displayHeight / WORLD_HEIGHT,
  );
  const offsetX = (displayWidth - WORLD_WIDTH * scale) / 2;
  const offsetY = (displayHeight - WORLD_HEIGHT * scale) / 2;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, element.width, element.height);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);

  context.fillStyle = 'rgba(237, 241, 238, 0.72)';
  context.beginPath();
  context.moveTo(...Object.values(isoToWorld(-GRID_EXTENT, -GRID_EXTENT)));

  for (const point of [
    isoToWorld(GRID_EXTENT, -GRID_EXTENT),
    isoToWorld(GRID_EXTENT, GRID_EXTENT),
    isoToWorld(-GRID_EXTENT, GRID_EXTENT),
  ]) {
    context.lineTo(point.x, point.y);
  }

  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(117, 133, 124, 0.18)';
  context.lineWidth = 1 / scale;

  for (const coordinate of gridLineCoordinates) {
    const startA = isoToWorld(coordinate, -GRID_EXTENT);
    const endA = isoToWorld(coordinate, GRID_EXTENT);
    const startB = isoToWorld(-GRID_EXTENT, coordinate);
    const endB = isoToWorld(GRID_EXTENT, coordinate);

    context.beginPath();
    context.moveTo(startA.x, startA.y);
    context.lineTo(endA.x, endA.y);
    context.stroke();

    context.beginPath();
    context.moveTo(startB.x, startB.y);
    context.lineTo(endB.x, endB.y);
    context.stroke();
  }
};

const scheduleDraw = () => {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = window.requestAnimationFrame(drawGrid);
};

const selectScene = (scene) => {
  emit('select', scene);
};

const handleSceneKeydown = (event, scene) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectScene(scene);
  }
};

onMounted(async () => {
  await nextTick();
  scheduleDraw();

  resizeObserver = new ResizeObserver(scheduleDraw);

  if (canvasHost.value) {
    resizeObserver.observe(canvasHost.value);
  }

  window.addEventListener('resize', scheduleDraw, { passive: true });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', scheduleDraw);
  window.cancelAnimationFrame(animationFrame);
});
</script>

<template>
  <section
    class="map-frame relative isolate overflow-hidden rounded-hig-lg border border-line/80 bg-surface shadow-hig-soft"
    :class="{ 'map-frame--expanded': expanded }"
  >
    <div ref="canvasHost" class="relative h-full min-h-[430px]">
      <canvas
        ref="canvas"
        class="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      <svg
        class="absolute inset-0 h-full w-full"
        :viewBox="`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="虚拟乌托邦世界地图"
      >
        <defs>
          <linearGradient id="building-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f8faf8" />
            <stop offset="100%" stop-color="#e3e9e5" />
          </linearGradient>
          <linearGradient id="roof-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#aebcb4" />
            <stop offset="100%" stop-color="#7e9488" />
          </linearGradient>
        </defs>

        <polygon
          :points="groundPolygon"
          fill="none"
          stroke="rgba(103, 124, 113, 0.2)"
          stroke-width="1.5"
        />

        <g
          v-for="scene in scenePoints"
          :key="scene.key"
          class="scene-point"
          :transform="`translate(${scene.position.x} ${scene.position.y})`"
          role="button"
          tabindex="0"
          :aria-label="`进入${scene.name}`"
          @mouseenter="scheduleDraw"
          @mouseleave="scheduleDraw"
          @click="selectScene(scene)"
          @keydown="handleSceneKeydown($event, scene)"
        >
          <ellipse
            class="scene-point__hitbox"
            cx="0"
            cy="10"
            rx="76"
            ry="48"
            fill="transparent"
          />

          <g v-if="scene.key === 'yard'" class="building">
            <path
              class="building__face"
              d="M-55 0 L0 -27 L55 0 L0 27 Z"
              fill="url(#building-fill)"
            />
            <path
              class="building__line"
              d="M-55 0 L0 -27 L55 0 L0 27 Z M-36 -9 L0 -27 L36 -9 L0 9 Z"
            />
            <path
              class="building__line"
              d="M0 -27 L0 9 M-55 0 L-36 -9 M55 0 L36 -9 M-36 -9 L-36 18 L0 36 L36 18 L36 -9"
            />
            <path class="building__roof" d="M-42 -7 L0 -28 L42 -7 L0 14 Z" />
            <path class="building__line" d="M-15 -17 L0 -9 L15 -17 L0 -25 Z" />
          </g>

          <g v-else-if="scene.key === 'pavilion'" class="building">
            <path
              class="building__face"
              d="M-39 5 L-20 -5 L20 -5 L39 5 L20 15 L-20 15 Z"
              fill="url(#building-fill)"
            />
            <path
              class="building__line"
              d="M-39 5 L-20 -5 L20 -5 L39 5 L20 15 L-20 15 Z"
            />
            <path class="building__roof" d="M-48 -4 L0 -31 L48 -4 L0 23 Z" />
            <path
              class="building__line"
              d="M-48 -4 L0 -31 L48 -4 L0 23 Z M-23 -13 L0 -31 L23 -13"
            />
            <path
              class="building__line"
              d="M-18 -2 L-18 17 M0 -9 L0 10 M18 -2 L18 17"
            />
          </g>

          <g v-else-if="scene.key === 'resource-wall'" class="building">
            <path
              class="building__face"
              d="M-50 4 L-24 -9 L42 -9 L16 4 Z"
              fill="url(#building-fill)"
            />
            <path
              class="building__line"
              d="M-50 4 L-24 -9 L42 -9 L16 4 Z M-24 -9 L-24 18 L16 31 L42 -9"
            />
            <path
              class="building__line"
              d="M-43 3 L-29 -4 M-26 3 L-12 -4 M-9 3 L5 -4 M8 3 L22 -4"
            />
            <path class="building__roof" d="M-54 1 L-27 -13 L45 -13 L18 1 Z" />
          </g>

          <g v-else-if="scene.key === 'library'" class="building">
            <path
              class="building__face"
              d="M-48 10 L-26 -1 L32 -1 L10 10 Z"
              fill="url(#building-fill)"
            />
            <path
              class="building__line"
              d="M-48 10 L-26 -1 L-26 27 L10 44 L10 10 L32 -1 L32 26 L10 44"
            />
            <path class="building__roof" d="M-51 -5 L0 -31 L45 -5 L-2 21 Z" />
            <path
              class="building__line"
              d="M-51 -5 L0 -31 L45 -5 L-2 21 Z M-25 -15 L0 -31 L25 -15"
            />
            <path
              class="building__line"
              d="M-17 2 L-17 20 M0 10 L0 28 M17 2 L17 20"
            />
          </g>

          <g v-else-if="scene.key === 'cabin'" class="building">
            <path
              class="building__face"
              d="M-34 8 L-18 0 L16 0 L32 8 L16 16 L-18 16 Z"
              fill="url(#building-fill)"
            />
            <path
              class="building__line"
              d="M-34 8 L-18 0 L-18 25 L-2 33 L-2 8 L16 0 L16 24 L-2 33"
            />
            <path class="building__roof" d="M-43 2 L0 -24 L38 2 L-5 28 Z" />
            <path
              class="building__line"
              d="M-43 2 L0 -24 L38 2 L-5 28 Z M-20 -9 L0 -24 L20 -9"
            />
            <path class="building__line" d="M-12 7 L-2 12 L8 7" />
          </g>

          <g v-else class="building building--forest">
            <path
              class="building__line"
              d="M-48 8 L-38 -9 L-27 2 L-15 -22 L-1 -3 L10 -17 L24 3 L38 -13 L48 8 Z"
            />
            <path
              class="building__line"
              d="M-38 -9 L-38 17 M-15 -22 L-15 17 M10 -17 L10 17 M38 -13 L38 17"
            />
            <path
              class="building__line"
              d="M-53 17 L-38 9 L-23 17 L-7 10 L10 17 L26 9 L43 17 L52 13"
            />
            <path
              class="building__line"
              d="M-24 28 L-9 18 L7 28 L22 19 L35 27"
            />
          </g>

          <g class="scene-point__label">
            <rect
              x="-37"
              y="46"
              width="74"
              height="28"
              rx="14"
              fill="rgba(255, 255, 255, 0.92)"
              stroke="rgba(218, 224, 219, 0.9)"
            />
            <text
              x="0"
              y="64"
              text-anchor="middle"
              font-size="14"
              font-weight="600"
              fill="#49534e"
            >
              {{ scene.name }}
            </text>
          </g>
        </g>
      </svg>
    </div>

    <div
      class="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-line/75 bg-surface/90 p-1.5 pl-4 shadow-hig-soft backdrop-blur-xl sm:left-5 sm:top-5"
    >
      <span class="text-xs font-medium text-muted">世界地图</span>
      <button
        type="button"
        class="grid h-8 w-8 place-items-center rounded-full text-muted transition duration-hig hover:bg-surface-muted hover:text-ink"
        :aria-label="expanded ? '收起地图' : '展开地图'"
        @click="$emit('update:expanded', !expanded)"
      >
        <svg
          v-if="!expanded"
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
        </svg>
      </button>
    </div>
  </section>
</template>

<style scoped>
.map-frame {
  height: clamp(430px, 68vh, 730px);
  transition:
    height 180ms ease,
    border-radius 180ms ease;
}

.map-frame--expanded {
  position: fixed;
  inset: 0;
  z-index: 60;
  height: 100dvh;
  border: 0;
  border-radius: 0;
}

.scene-point {
  cursor: pointer;
  outline: none;
}

.scene-point .building__line {
  fill: none;
  stroke: rgba(82, 104, 93, 0.78);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  transition:
    stroke 180ms ease,
    stroke-width 180ms ease;
}

.scene-point .building__face,
.scene-point .building__roof {
  stroke: none;
  transition: opacity 180ms ease;
}

.scene-point .building__roof {
  fill: url('#roof-fill');
  opacity: 0.72;
}

.scene-point__label {
  transition: transform 180ms ease;
}

.scene-point:hover .building__line,
.scene-point:focus-visible .building__line {
  stroke: rgb(var(--c-accent-strong));
  stroke-width: 2.4;
}

.scene-point:hover .building__face,
.scene-point:focus-visible .building__face {
  fill: #f2f7f4;
}

.scene-point:hover .building__roof,
.scene-point:focus-visible .building__roof {
  opacity: 0.95;
}

.scene-point:hover .scene-point__label,
.scene-point:focus-visible .scene-point__label {
  transform: translateY(2px);
}

.scene-point__hitbox:focus {
  outline: none;
}

@media (max-width: 640px) {
  .map-frame {
    height: min(72vh, 620px);
    min-height: 440px;
  }
}
</style>
