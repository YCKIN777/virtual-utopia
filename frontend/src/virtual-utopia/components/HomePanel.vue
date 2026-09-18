<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { homeMaterialCategories } from '../data/homeMaterials.js';
import { worldStore } from '../stores/worldStore.js';

const props = defineProps({
  plotId: {
    type: String,
    default: '',
  },
  editMode: {
    type: Boolean,
    default: false,
  },
  selectedMaterialId: {
    type: String,
    default: '',
  },
  selectedItemId: {
    type: String,
    default: '',
  },
});

const emit = defineEmits([
  'close',
  'toggle-edit',
  'select-material',
  'place-center',
  'rotate-item',
  'delete-item',
]);

const activeCategory = ref(homeMaterialCategories[0].id);
const message = ref('');
const clue = ref('');
const selectedHome = computed(() => worldStore.getHomePlot(props.plotId));
const isOwner = computed(() => worldStore.canEditHome(props.plotId));
const canView = computed(() => worldStore.canViewHome(props.plotId));
const isPrivate = computed(() => selectedHome.value?.visibility === 'private');
const selectedItem = computed(() =>
  selectedHome.value?.items.find((item) => item.id === props.selectedItemId),
);
const activeMaterials = computed(
  () =>
    homeMaterialCategories.find(
      (category) => category.id === activeCategory.value,
    )?.items || [],
);
const occupiedCount = computed(
  () => worldStore.state.homes.filter((home) => home.ownerId).length,
);

const formatDate = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const submitMessage = () => {
  const accepted = worldStore.addHomeMessage({
    plotId: props.plotId,
    content: message.value,
  });

  if (accepted) {
    message.value = '';
  }
};

const buryClue = () => {
  const accepted = worldStore.buryClue({
    plotId: props.plotId,
    clue: clue.value,
  });

  if (accepted) {
    clue.value = '';
  }
};

const discoverClue = () => {
  worldStore.discoverClue(props.plotId);
};

const handleDragStart = (event, material) => {
  event.dataTransfer.setData('application/x-utopia-material', material.id);
  event.dataTransfer.effectAllowed = 'copy';
};
</script>

<template>
  <aside class="vu-home-panel">
    <template v-if="selectedHome">
      <header class="vu-home-panel__header">
        <div>
          <span class="vu-kicker">
            HOME PLOT {{ selectedHome.number.toString().padStart(2, '0') }}
          </span>
          <h2>{{ selectedHome.ownerName }}的家园</h2>
          <p>
            {{ isOwner ? '地块主人' : '访客视角' }} ·
            {{ isPrivate ? '私密' : '公开参观' }}
          </p>
        </div>
        <button
          type="button"
          class="vu-icon-button"
          aria-label="关闭家园面板"
          @click="$emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div v-if="!canView" class="vu-home-private-state">
        <span class="vu-home-private-state__mark" aria-hidden="true"> × </span>
        <strong>这是一处私密家园</strong>
        <p>只有地块主人可以查看家园内容和留言。</p>
      </div>

      <template v-else>
        <div class="vu-home-panel__actions">
          <button
            v-if="isOwner"
            type="button"
            class="vu-button vu-button--dark vu-button--small"
            @click="$emit('toggle-edit')"
          >
            {{ editMode ? '退出编辑' : '编辑家园' }}
          </button>
          <div v-if="isOwner" class="vu-segmented">
            <button
              type="button"
              :class="{
                'is-active': selectedHome.visibility === 'public',
              }"
              @click="worldStore.setHomeVisibility(plotId, 'public')"
            >
              公开
            </button>
            <button
              type="button"
              :class="{
                'is-active': selectedHome.visibility === 'private',
              }"
              @click="worldStore.setHomeVisibility(plotId, 'private')"
            >
              私密
            </button>
          </div>
        </div>

        <section v-if="editMode && isOwner" class="vu-home-editor">
          <div class="vu-home-editor__balance">
            <span>世界碎片</span>
            <strong>
              {{ worldStore.state.user?.worldShards || 0 }}
            </strong>
          </div>

          <div class="vu-material-tabs">
            <button
              v-for="category in homeMaterialCategories"
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

          <div class="vu-material-grid">
            <article
              v-for="material in activeMaterials"
              :key="material.id"
              class="vu-material-card"
              :class="{
                'is-selected': selectedMaterialId === material.id,
                'is-locked': !worldStore.isMaterialUnlocked(material.id),
              }"
              draggable="true"
              @dragstart="handleDragStart($event, material)"
            >
              <button
                type="button"
                class="vu-material-card__main"
                @click="
                  worldStore.isMaterialUnlocked(material.id)
                    ? $emit('select-material', material.id)
                    : worldStore.unlockMaterial(material.id)
                "
              >
                <span
                  class="vu-material-swatch"
                  :style="{
                    '--material-color': material.color,
                    '--material-roof': material.roofColor || material.color,
                  }"
                  aria-hidden="true"
                />
                <strong>{{ material.name }}</strong>
                <small>
                  {{
                    worldStore.isMaterialUnlocked(material.id)
                      ? selectedMaterialId === material.id
                        ? '已选，点击地图放置'
                        : '拖拽或点击选择'
                      : `世界碎片 ×${material.cost}`
                  }}
                </small>
              </button>
            </article>
          </div>

          <button
            v-if="selectedMaterialId"
            type="button"
            class="vu-button vu-button--accent vu-button--wide"
            @click="$emit('place-center')"
          >
            放到地块中心
          </button>

          <div v-if="selectedItem" class="vu-item-tools">
            <span>已选中素材</span>
            <button
              type="button"
              class="vu-button vu-button--light vu-button--small"
              @click="$emit('rotate-item', -15)"
            >
              左转
            </button>
            <button
              type="button"
              class="vu-button vu-button--light vu-button--small"
              @click="$emit('rotate-item', 15)"
            >
              右转
            </button>
            <button
              type="button"
              class="vu-button vu-button--danger-outline vu-button--small"
              @click="$emit('delete-item')"
            >
              删除
            </button>
          </div>
        </section>

        <section class="vu-home-social">
          <div class="vu-home-social__heading">
            <span class="vu-kicker">VISITOR NOTES</span>
            <strong>{{ selectedHome.messages.length }} 条留言</strong>
          </div>

          <form
            v-if="worldStore.state.user"
            class="vu-inline-form"
            @submit.prevent="submitMessage"
          >
            <input
              v-model="message"
              maxlength="120"
              placeholder="写下参观留言"
            />
            <button
              type="submit"
              class="vu-button vu-button--dark vu-button--small"
            >
              留言
            </button>
          </form>

          <RouterLink
            v-else
            :to="{
              name: 'login',
              query: { redirect: '/?home=' + plotId },
            }"
            class="vu-text-link"
          >
            登录后留言
          </RouterLink>

          <div class="vu-home-messages">
            <article
              v-for="item in selectedHome.messages.slice(-3).reverse()"
              :key="item.id"
            >
              <div>
                <strong>{{ item.author }}</strong>
                <span>{{ formatDate(item.createdAt) }}</span>
              </div>
              <p>{{ item.content }}</p>
            </article>
            <p
              v-if="selectedHome.messages.length === 0"
              class="vu-home-messages__empty"
            >
              还没有参观留言。
            </p>
          </div>
        </section>

        <section class="vu-home-clue">
          <div class="vu-home-social__heading">
            <span class="vu-kicker">HIDDEN CLUE</span>
            <strong>
              {{ selectedHome.hiddenClue ? '已埋藏线索' : '暂无线索' }}
            </strong>
          </div>

          <template v-if="isOwner">
            <form class="vu-inline-form" @submit.prevent="buryClue">
              <input v-model="clue" maxlength="80" placeholder="输入隐藏线索" />
              <button
                type="submit"
                class="vu-button vu-button--dark vu-button--small"
              >
                埋藏
              </button>
            </form>
          </template>

          <template v-else-if="selectedHome.hiddenClue">
            <button
              type="button"
              class="vu-button vu-button--accent vu-button--wide"
              :disabled="
                !worldStore.state.user ||
                selectedHome.clueFoundBy.includes(worldStore.state.user?.id)
              "
              @click="discoverClue"
            >
              {{
                !worldStore.state.user
                  ? '登录后寻找线索'
                  : selectedHome.clueFoundBy.includes(worldStore.state.user.id)
                    ? '线索已发现'
                    : '寻找隐藏线索'
              }}
            </button>
          </template>
        </section>
      </template>
    </template>

    <template v-else>
      <div class="vu-home-panel__empty">
        <span class="vu-kicker">HOME SYSTEM</span>
        <h2>选择一块家园地块</h2>
        <p>地图中共有 50 块家园用地。点击地块查看权限、留言和搭建内容。</p>
        <div class="vu-home-capacity">
          <strong>{{ occupiedCount }}</strong>
          <span>/ 50 已入住</span>
        </div>
        <RouterLink
          v-if="!worldStore.state.user"
          :to="{ name: 'login', query: { redirect: '/' } }"
          class="vu-button vu-button--accent"
        >
          登录并进入家园
        </RouterLink>
      </div>
    </template>
  </aside>
</template>
