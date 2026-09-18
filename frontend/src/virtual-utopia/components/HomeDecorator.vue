<script setup>
import { computed, ref, watch } from 'vue';
import {
  homeMaterialCategories,
  homeMaterialMap,
} from '../data/homeMaterials.js';
import { worldStore } from '../stores/worldStore.js';

const open = ref(false);
const activeArea = ref('courtyard');
const activeCategory = ref('furniture');
const selectedMaterialId = ref('');
const selectedItemId = ref('');
const saveState = ref('idle');
const stageRef = ref(null);
const allowedCategories = new Set([
  'furniture',
  'trees',
  'flowers',
  'fences',
  'lights',
  'decor',
  'outdoor-plants',
  'potted-plants',
  'landscape-rocks',
  'lanterns',
  'ornaments',
  'soft-furnishings',
]);

const editorHome = computed(() => worldStore.getOwnedHome());
const canOpen = computed(
  () =>
    Boolean(editorHome.value) && worldStore.canEditHome(editorHome.value.id),
);
const editorCategories = computed(() =>
  homeMaterialCategories.filter((category) =>
    allowedCategories.has(category.id),
  ),
);
const activeMaterials = computed(
  () =>
    editorCategories.value.find(
      (category) => category.id === activeCategory.value,
    )?.items || [],
);
const activeItems = computed(() => {
  const home = editorHome.value;

  if (!home) {
    return [];
  }

  return activeArea.value === 'interior'
    ? home.interiorItems || []
    : home.items || [];
});
const selectedItem = computed(() =>
  activeItems.value.find((item) => item.id === selectedItemId.value),
);

const openEditor = () => {
  if (!canOpen.value) {
    return;
  }

  open.value = true;
  selectedMaterialId.value = '';
  selectedItemId.value = '';
  saveState.value = 'idle';
};

const closeEditor = () => {
  open.value = false;
  selectedItemId.value = '';
};

const setArea = (area) => {
  activeArea.value = area;
  selectedItemId.value = '';
};

const beginMaterialDrag = (event, material) => {
  event.dataTransfer.setData('application/x-utopia-material', material.id);
  event.dataTransfer.effectAllowed = 'copy';
};

const beginItemDrag = (event, item) => {
  event.stopPropagation();
  event.dataTransfer.setData('application/x-utopia-item', item.id);
  event.dataTransfer.effectAllowed = 'move';
  selectedItemId.value = item.id;
};

const getDropPosition = (event) => {
  const bounds = stageRef.value?.getBoundingClientRect();

  if (!bounds) {
    return null;
  }

  return {
    x: Math.min(
      0.94,
      Math.max(0.06, (event.clientX - bounds.left) / bounds.width),
    ),
    y: Math.min(
      0.9,
      Math.max(0.1, (event.clientY - bounds.top) / bounds.height),
    ),
  };
};

const addMaterialAt = (materialId, x, y) => {
  const home = editorHome.value;
  const material = homeMaterialMap[materialId];

  if (!home || !material) {
    return;
  }

  if (!worldStore.isMaterialUnlocked(materialId)) {
    if (!worldStore.unlockMaterial(materialId)) {
      return;
    }
  }

  const item =
    activeArea.value === 'interior'
      ? worldStore.addInteriorItem({
          plotId: home.id,
          materialId,
          x,
          y,
        })
      : worldStore.addHomeItem({
          plotId: home.id,
          materialId,
          x,
          y,
        });

  if (item) {
    selectedItemId.value = item.id;
    selectedMaterialId.value = materialId;
    saveState.value = 'dirty';
  }
};

const handleDrop = (event) => {
  event.preventDefault();
  const position = getDropPosition(event);
  const itemId = event.dataTransfer.getData('application/x-utopia-item') || '';
  const materialId =
    event.dataTransfer.getData('application/x-utopia-material') ||
    selectedMaterialId.value;

  if (!position) {
    return;
  }

  const home = editorHome.value;

  if (!home || !worldStore.canEditHome(home.id)) {
    return;
  }

  if (itemId) {
    if (activeArea.value === 'interior') {
      worldStore.updateInteriorItem({
        plotId: home.id,
        itemId,
        x: position.x,
        y: position.y,
      });
    } else {
      worldStore.updateHomeItem({
        plotId: home.id,
        itemId,
        x: position.x,
        y: position.y,
      });
    }
    selectedItemId.value = itemId;
    saveState.value = 'dirty';
    return;
  }

  if (materialId) {
    addMaterialAt(materialId, position.x, position.y);
  }
};

const rotateSelected = (degrees) => {
  const home = editorHome.value;
  const item = selectedItem.value;

  if (!home || !item) {
    return;
  }

  const rotation = item.rotation + degrees;

  if (activeArea.value === 'interior') {
    worldStore.updateInteriorItem({
      plotId: home.id,
      itemId: item.id,
      rotation,
    });
  } else {
    worldStore.updateHomeItem({
      plotId: home.id,
      itemId: item.id,
      rotation,
    });
  }
  saveState.value = 'dirty';
};

const deleteSelected = () => {
  const home = editorHome.value;
  const item = selectedItem.value;

  if (!home || !item) {
    return;
  }

  if (activeArea.value === 'interior') {
    worldStore.removeInteriorItem({
      plotId: home.id,
      itemId: item.id,
    });
  } else {
    worldStore.removeHomeItem({
      plotId: home.id,
      itemId: item.id,
    });
  }
  selectedItemId.value = '';
  saveState.value = 'dirty';
};

const saveDecorations = async () => {
  saveState.value = 'saving';
  const saved = await worldStore.persistNow();

  if (saved) {
    saveState.value = 'saved';
    return;
  }

  saveState.value =
    worldStore.state.persistence.status === 'offline' ? 'offline' : 'error';
};

watch(canOpen, (value) => {
  if (!value) {
    open.value = false;
  }
});
</script>

<template>
  <button
    v-if="canOpen"
    type="button"
    class="vu-decorator-trigger"
    @click="openEditor"
  >
    家园装扮
  </button>

  <Teleport to="body">
    <div
      v-if="open && editorHome"
      class="vu-decorator-overlay"
      @click.self="closeEditor"
    >
      <section class="vu-decorator-panel">
        <header class="vu-decorator-header">
          <div>
            <span class="vu-kicker">HOME DECORATOR</span>
            <h2>{{ editorHome.ownerName }}的家园</h2>
            <p>{{ editorHome.id }} · 编辑自己的院落与室内空间</p>
          </div>
          <button
            type="button"
            class="vu-decorator-close"
            aria-label="关闭家园编辑器"
            @click="closeEditor"
          >
            ×
          </button>
        </header>

        <div class="vu-decorator-tabs">
          <button
            type="button"
            :class="{ 'is-active': activeArea === 'courtyard' }"
            @click="setArea('courtyard')"
          >
            院落
          </button>
          <button
            type="button"
            :class="{ 'is-active': activeArea === 'interior' }"
            @click="setArea('interior')"
          >
            室内
          </button>
          <span class="vu-decorator-tabs__count">
            {{ activeItems.length }} 件物品
          </span>
        </div>

        <div class="vu-decorator-body">
          <aside class="vu-decorator-library">
            <div class="vu-decorator-categories">
              <button
                v-for="category in editorCategories"
                :key="category.id"
                type="button"
                :class="{
                  'is-active': activeCategory === category.id,
                }"
                @click="activeCategory = category.id"
              >
                {{ category.label }}
              </button>
            </div>

            <div class="vu-decorator-materials">
              <button
                v-for="material in activeMaterials"
                :key="material.id"
                type="button"
                class="vu-decorator-material"
                :class="{
                  'is-selected': selectedMaterialId === material.id,
                  'is-locked': !worldStore.isMaterialUnlocked(material.id),
                }"
                draggable="true"
                @dragstart="beginMaterialDrag($event, material)"
                @click="selectedMaterialId = material.id"
              >
                <span
                  class="vu-decorator-swatch"
                  :style="{
                    '--material-color': material.color,
                    '--material-roof': material.roofColor || material.color,
                  }"
                  aria-hidden="true"
                />
                <span>
                  <strong>{{ material.name }}</strong>
                  <small>
                    {{
                      worldStore.isMaterialUnlocked(material.id)
                        ? '拖到场景中放置'
                        : `解锁需要 ${material.cost} 碎片`
                    }}
                  </small>
                </span>
              </button>
            </div>
          </aside>

          <div
            ref="stageRef"
            class="vu-decorator-stage"
            :class="`is-${activeArea}`"
            @dragover.prevent
            @drop="handleDrop"
          >
            <div class="vu-decorator-stage__guide">
              <span v-if="activeArea === 'courtyard'"> 院落摆放区 </span>
              <span v-else>室内摆放区</span>
            </div>

            <button
              v-for="item in activeItems"
              :key="item.id"
              type="button"
              class="vu-decorator-item"
              :class="{
                'is-selected': selectedItemId === item.id,
              }"
              :style="{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                '--item-rotation': `${item.rotation || 0}deg`,
                '--item-color':
                  homeMaterialMap[item.materialId]?.color || '#8d6b46',
              }"
              draggable="true"
              @dragstart="beginItemDrag($event, item)"
              @click="selectedItemId = item.id"
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>

        <footer class="vu-decorator-footer">
          <div class="vu-decorator-status">
            <span v-if="selectedItem">
              已选中：{{ homeMaterialMap[selectedItem.materialId]?.name }}
            </span>
            <span v-else>拖拽素材到摆放区，或选择已有物品</span>
            <strong v-if="saveState === 'saving'">保存中…</strong>
            <strong v-else-if="saveState === 'saved'"> 已保存到 Phase5 </strong>
            <strong v-else-if="saveState === 'offline'">
              离线模式，当前仅内存
            </strong>
            <strong v-else-if="saveState === 'error'"> 保存失败 </strong>
          </div>

          <div class="vu-decorator-tools">
            <button
              type="button"
              :disabled="!selectedItem"
              @click="rotateSelected(-15)"
            >
              左转
            </button>
            <button
              type="button"
              :disabled="!selectedItem"
              @click="rotateSelected(15)"
            >
              右转
            </button>
            <button
              type="button"
              :disabled="!selectedItem"
              @click="deleteSelected"
            >
              删除
            </button>
            <button
              type="button"
              class="is-primary"
              :disabled="saveState === 'saving'"
              @click="saveDecorations"
            >
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.vu-decorator-trigger {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 30;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 6px;
  background: #1f4f45;
  color: #fff;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 8px 26px rgba(20, 40, 34, 0.24);
}

.vu-decorator-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(13, 29, 27, 0.42);
  backdrop-filter: blur(3px);
}

.vu-decorator-panel {
  width: min(1160px, 100%);
  height: min(760px, 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(35, 69, 61, 0.2);
  border-radius: 8px;
  background: #f5f3ec;
  color: #203b36;
  box-shadow: 0 24px 80px rgba(13, 29, 27, 0.34);
}

.vu-decorator-header,
.vu-decorator-footer,
.vu-decorator-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: #fff;
}

.vu-decorator-header {
  border-bottom: 1px solid #dfe4dc;
}

.vu-decorator-header h2,
.vu-decorator-header p {
  margin: 0;
}

.vu-decorator-header h2 {
  margin-top: 2px;
  font-size: 22px;
}

.vu-decorator-header p {
  margin-top: 3px;
  color: #66766e;
  font-size: 13px;
}

.vu-decorator-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: #edf1eb;
  color: #3c5049;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.vu-decorator-tabs {
  justify-content: flex-start;
  padding-block: 10px;
  border-bottom: 1px solid #e3e7e0;
}

.vu-decorator-tabs button,
.vu-decorator-categories button {
  border: 0;
  background: transparent;
  color: #53675f;
  font: inherit;
  cursor: pointer;
}

.vu-decorator-tabs button {
  padding: 7px 12px;
  border-radius: 5px;
  font-weight: 700;
}

.vu-decorator-tabs button.is-active,
.vu-decorator-categories button.is-active {
  background: #244f45;
  color: #fff;
}

.vu-decorator-tabs__count {
  margin-left: auto;
  color: #78867f;
  font-size: 12px;
}

.vu-decorator-body {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
}

.vu-decorator-library {
  min-height: 0;
  overflow: auto;
  padding: 14px;
  border-right: 1px solid #dfe4dc;
  background: #f0f2ec;
}

.vu-decorator-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.vu-decorator-categories button {
  padding: 6px 9px;
  border-radius: 4px;
  background: #e4e9e2;
  font-size: 12px;
}

.vu-decorator-materials {
  display: grid;
  gap: 8px;
}

.vu-decorator-material {
  display: grid;
  grid-template-columns: 42px 1fr;
  align-items: center;
  gap: 10px;
  padding: 9px;
  border: 1px solid #d8dfd7;
  border-radius: 6px;
  background: #fff;
  color: #2d453e;
  text-align: left;
  cursor: grab;
}

.vu-decorator-material.is-selected {
  border-color: #2d6c5c;
  box-shadow: 0 0 0 2px rgba(45, 108, 92, 0.15);
}

.vu-decorator-material.is-locked {
  opacity: 0.68;
}

.vu-decorator-material strong,
.vu-decorator-material small {
  display: block;
}

.vu-decorator-material small {
  margin-top: 3px;
  color: #7a8881;
  font-size: 11px;
}

.vu-decorator-swatch {
  width: 38px;
  height: 32px;
  border-radius: 5px;
  background: linear-gradient(
    145deg,
    var(--material-roof),
    var(--material-color)
  );
}

.vu-decorator-stage {
  position: relative;
  min-height: 320px;
  overflow: hidden;
  outline: 2px dashed transparent;
  background:
    linear-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.16) 1px, transparent 1px),
    #789b68;
  background-size: 34px 34px;
  outline-offset: -9px;
}

.vu-decorator-stage.is-interior {
  background:
    linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
    #c39b68;
  background-size: 28px 28px;
}

.vu-decorator-stage__guide {
  position: absolute;
  top: 12px;
  left: 14px;
  padding: 5px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.72);
  color: #40564d;
  font-size: 12px;
  pointer-events: none;
}

.vu-decorator-item {
  position: absolute;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.72);
  border-radius: 6px;
  background: var(--item-color);
  box-shadow: 0 4px 10px rgba(32, 54, 45, 0.22);
  cursor: grab;
  transform: translate(-50%, -50%) rotate(var(--item-rotation));
}

.vu-decorator-item.is-selected {
  border-color: #fff2a8;
  box-shadow:
    0 0 0 3px #2b7965,
    0 5px 14px rgba(32, 54, 45, 0.3);
}

.vu-decorator-item span {
  display: block;
  width: 16px;
  height: 16px;
  margin: 7px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.6);
}

.vu-decorator-footer {
  border-top: 1px solid #dfe4dc;
}

.vu-decorator-status {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #65746d;
  font-size: 12px;
}

.vu-decorator-status strong {
  color: #2c6759;
}

.vu-decorator-tools {
  display: flex;
  gap: 7px;
}

.vu-decorator-tools button {
  padding: 8px 11px;
  border: 1px solid #cbd5cc;
  border-radius: 5px;
  background: #fff;
  color: #38554c;
  font: inherit;
  cursor: pointer;
}

.vu-decorator-tools button.is-primary {
  border-color: #2d6c5c;
  background: #2d6c5c;
  color: #fff;
}

.vu-decorator-tools button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 760px) {
  .vu-decorator-overlay {
    padding: 0;
  }

  .vu-decorator-panel {
    height: 100%;
    border-radius: 0;
  }

  .vu-decorator-body {
    grid-template-columns: 1fr;
    grid-template-rows: 210px 1fr;
  }

  .vu-decorator-library {
    border-right: 0;
    border-bottom: 1px solid #dfe4dc;
  }

  .vu-decorator-materials {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vu-decorator-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .vu-decorator-trigger {
    left: 14px;
    bottom: 14px;
  }
}
</style>
