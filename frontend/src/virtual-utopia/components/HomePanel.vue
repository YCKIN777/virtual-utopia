<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { worldStore } from '../stores/worldStore.js';

const props = defineProps({
  plotId: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['close']);

const message = ref('');
const clue = ref('');
const selectedHome = computed(() => worldStore.getHomePlot(props.plotId));
const isOwner = computed(() => worldStore.canEditHome(props.plotId));
const canView = computed(() => worldStore.canViewHome(props.plotId));
const isPrivate = computed(() => selectedHome.value?.visibility === 'private');
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

const deleteMessage = (messageId) => {
  worldStore.removeHomeMessage({
    plotId: props.plotId,
    messageId,
  });
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
          <div v-if="isOwner" class="vu-segmented">
            <span class="vu-segmented__label">参观权限</span>
            <button
              type="button"
              :class="{
                'is-active': selectedHome.visibility === 'public',
              }"
              @click="worldStore.setVisitPermission(plotId, true)"
            >
              开放参观
            </button>
            <button
              type="button"
              :class="{
                'is-active': selectedHome.visibility === 'private',
              }"
              @click="worldStore.setVisitPermission(plotId, false)"
            >
              关闭参观
            </button>
          </div>
        </div>

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
              v-for="item in [...selectedHome.messages].reverse()"
              :key="item.id"
            >
              <div>
                <strong>{{ item.author }}</strong>
                <span>{{ formatDate(item.createdAt) }}</span>
                <button
                  v-if="isOwner"
                  type="button"
                  class="vu-home-messages__delete"
                  aria-label="删除留言"
                  @click="deleteMessage(item.id)"
                >
                  删除
                </button>
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

        <section v-if="isOwner" class="vu-home-visits">
          <div class="vu-home-visits__heading">
            <span class="vu-kicker">VISITOR LOG</span>
            <strong>{{ (selectedHome.visits || []).length }} 条来访记录</strong>
          </div>
          <div class="vu-home-visits__list">
            <article
              v-for="item in [...(selectedHome.visits || [])].reverse()"
              :key="item.id"
            >
              <div>
                <strong>{{ item.username }}</strong>
                <span>{{ formatDate(item.visitedAt) }}</span>
              </div>
            </article>
            <p
              v-if="!(selectedHome.visits || []).length"
              class="vu-home-visits__empty"
            >
              还没有访客到访记录。
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

<style scoped>
.vu-segmented__label {
  margin-right: 4px;
  color: #66766e;
  font-size: 12px;
  font-weight: 700;
}

.vu-home-messages__delete {
  margin-left: auto;
  background: none;
  border: 0;
  color: #c05a4a;
  font-size: 11px;
  cursor: pointer;
  padding: 0 0 0 6px;
}
</style>
