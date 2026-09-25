<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { worldStore } from '../stores/worldStore.js';

const CARD_TYPES = [
  {
    id: 'work_plan',
    label: '工作计划',
    mark: '📋',
    communityVisible: true,
    bodyLabel: '计划内容',
    bodyPlaceholder: '记录你的工作计划……',
  },
  {
    id: 'travel_log',
    label: '出游记录',
    mark: '🧭',
    communityVisible: true,
    hasInvite: true,
    bodyLabel: '行程见闻',
    bodyPlaceholder: '记录旅途见闻……',
  },
  {
    id: 'life_note',
    label: '生活随记',
    mark: '📝',
    communityVisible: true,
    bodyLabel: '随笔内容',
    bodyPlaceholder: '写下此刻的想法……',
  },
  {
    id: 'wish_list',
    label: '心愿清单',
    mark: '⭐',
    communityVisible: true,
    bodyLabel: '心愿内容',
    bodyPlaceholder: '记下想完成的心愿……',
  },
  {
    id: 'favorite',
    label: '收藏角',
    mark: '🔖',
    communityVisible: false,
    bodyLabel: '收藏内容',
    bodyPlaceholder: '收藏景观或公开随笔……',
  },
];

const props = defineProps({
  filterTypes: { type: Array, default: null },
});

const visibleTypes = computed(() =>
  props.filterTypes
    ? CARD_TYPES.filter((type) => props.filterTypes.includes(type.id))
    : CARD_TYPES,
);

const activeType = ref('work_plan');
if (!visibleTypes.value.some((type) => type.id === activeType.value)) {
  activeType.value = visibleTypes.value[0]?.id || 'work_plan';
}
const dialogOpen = ref(false);
const editingId = ref(null);
const busy = ref(false);
const errorMessage = ref('');

const form = reactive({
  title: '',
  body: '',
  permission: 'self',
  inviteOpen: false,
});

const currentType = computed(() =>
  CARD_TYPES.find((type) => type.id === activeType.value),
);

const mineCards = computed(() =>
  worldStore.state.residentCards.mine.filter(
    (card) => card.cardType === activeType.value,
  ),
);

const communityCards = computed(() => {
  if (!currentType.value?.communityVisible) {
    return [];
  }

  return worldStore.state.residentCards.community.filter(
    (card) => card.cardType === activeType.value,
  );
});

const permissionLabel = (permission) =>
  permission === 'residents' ? '原住民可见' : '仅自己';

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const openCreate = () => {
  editingId.value = null;
  form.title = '';
  form.body = '';
  form.permission = 'self';
  form.inviteOpen = false;
  errorMessage.value = '';
  dialogOpen.value = true;
};

const openEdit = (card) => {
  editingId.value = card.id;
  form.title = card.content?.title || '';
  form.body = card.content?.body || '';
  form.permission = card.permission || 'self';
  form.inviteOpen = Boolean(card.content?.inviteOpen);
  errorMessage.value = '';
  dialogOpen.value = true;
};

const submit = async () => {
  const title = form.title.trim();
  const body = form.body.trim();

  if (!title && !body) {
    errorMessage.value = '请填写标题或内容';
    return;
  }

  busy.value = true;
  errorMessage.value = '';

  const content = {
    title,
    body,
    ...(currentType.value?.hasInvite ? { inviteOpen: form.inviteOpen } : {}),
  };

  let result;

  if (editingId.value) {
    result = await worldStore.updateResidentCard(editingId.value, {
      content,
      permission: form.permission,
    });
  } else {
    result = await worldStore.createResidentCard({
      cardType: activeType.value,
      content,
      permission: form.permission,
    });
  }

  busy.value = false;

  if (!result.ok) {
    errorMessage.value = result.error || '保存失败';
    return;
  }

  dialogOpen.value = false;
};

const remove = async (card) => {
  await worldStore.deleteResidentCard(card.id);
};

// —— P2 卡片交互：报名/帮你/想要/评论 ——
const commentInputs = reactive({});
const commentOpen = reactive({});

const interactionsOf = (cardId) =>
  worldStore.state.cardInteractions[cardId] || [];
const signupsOf = (cardId) =>
  interactionsOf(cardId).filter((item) => item.kind === 'signup');
const helpOf = (cardId) =>
  interactionsOf(cardId).filter((item) => item.kind === 'help');
const wantOf = (cardId) =>
  interactionsOf(cardId).filter((item) => item.kind === 'want');
const commentsOf = (cardId) =>
  interactionsOf(cardId).filter((item) => item.kind === 'comment');

const loadInteractions = async () => {
  const cards = [...mineCards.value, ...communityCards.value];
  await Promise.all(cards.map((card) => worldStore.loadCardInteractions(card.id)));
};

const doInteraction = async (card, kind) => {
  await worldStore.createCardInteraction({ cardId: card.id, kind });
};

const toggleComment = (cardId) => {
  commentOpen[cardId] = !commentOpen[cardId];
};

const submitComment = async (card) => {
  const content = (commentInputs[card.id] || '').trim();

  if (!content) {
    return;
  }

  const result = await worldStore.createCardInteraction({
    cardId: card.id,
    kind: 'comment',
    content,
  });

  if (result.ok) {
    commentInputs[card.id] = '';
    commentOpen[card.id] = false;
  }
};

const watchCardsAndLoad = async () => {
  await loadInteractions();
};

onMounted(async () => {
  await worldStore.loadResidentCards();
  await watchCardsAndLoad();
});

watch(activeType, watchCardsAndLoad);
</script>

<template>
  <section class="rc-panel">
    <nav class="rc-tabs" aria-label="居民主页卡片分类">
      <button
        v-for="type in visibleTypes"
        :key="type.id"
        type="button"
        class="rc-tab"
        :class="{ 'rc-tab--active': activeType === type.id }"
        @click="activeType = type.id"
      >
        <span aria-hidden="true">{{ type.mark }}</span>
        {{ type.label }}
      </button>
    </nav>

    <div class="rc-body">
      <div class="rc-head">
        <div class="rc-head__meta">
          <strong>{{ currentType.label }}</strong>
          <span>
            {{
              currentType.communityVisible
                ? '单条内容可设为「仅自己」或「原住民可见」'
                : '仅本人可见'
            }}
          </span>
        </div>
        <button
          type="button"
          class="rc-add"
          @click="openCreate"
        >
          + 新增
        </button>
      </div>

      <div v-if="!mineCards.length && !communityCards.length" class="rc-empty">
        还没有内容，点击「+ 新增」记录第一条吧
      </div>

      <div v-if="mineCards.length" class="rc-list">
        <article
          v-for="card in mineCards"
          :key="card.id"
          class="rc-card"
        >
          <div class="rc-card__main">
            <div class="rc-card__title">
              <strong>{{ card.content?.title || '（无标题）' }}</strong>
              <span class="rc-badge" :class="`rc-badge--${card.permission}`">
                {{ permissionLabel(card.permission) }}
              </span>
              <span
                v-if="card.cardType === 'travel_log' && card.content?.inviteOpen"
                class="rc-badge rc-badge--invite"
              >
                漫游邀约
              </span>
            </div>
            <p v-if="card.content?.body" class="rc-card__body">
              {{ card.content.body }}
            </p>
            <small class="rc-card__time">{{ formatDate(card.createdAt) }}</small>

            <div v-if="interactionsOf(card.id).length" class="rc-interactions">
              <template v-if="card.cardType === 'travel_log'">
                <div class="rc-interaction-line">
                  <span class="rc-kicker">同行名单</span>
                  <span class="rc-interaction-names">
                    {{ signupsOf(card.id).map((i) => i.username).join('、') }}
                  </span>
                </div>
              </template>
              <template v-else-if="card.cardType === 'wish_list'">
                <div
                  v-for="i in [...helpOf(card.id), ...wantOf(card.id)]"
                  :key="i.id"
                  class="rc-interaction-line"
                >
                  <strong>{{ i.username }}</strong>
                  <span>{{ i.kind === 'help' ? '我来帮你' : '我也想要' }}</span>
                </div>
              </template>
              <template v-else-if="card.cardType === 'life_note'">
                <div
                  v-for="c in commentsOf(card.id)"
                  :key="c.id"
                  class="rc-interaction-line"
                >
                  <strong>{{ c.username }}</strong>
                  <span>{{ c.content }}</span>
                </div>
              </template>
            </div>
          </div>
          <div class="rc-card__actions">
            <button type="button" class="rc-mini" @click="openEdit(card)">
              编辑
            </button>
            <button type="button" class="rc-mini rc-mini--danger" @click="remove(card)">
              删除
            </button>
          </div>
        </article>
      </div>

      <div
        v-if="communityCards.length"
        class="rc-community"
      >
        <div class="rc-community__head">邻里分享</div>
        <article
          v-for="card in communityCards"
          :key="card.id"
          class="rc-card rc-card--community"
        >
          <div class="rc-card__main">
            <div class="rc-card__title">
              <strong>{{ card.content?.title || '（无标题）' }}</strong>
              <span
                v-if="card.cardType === 'travel_log' && card.content?.inviteOpen"
                class="rc-badge rc-badge--invite"
              >
                漫游邀约
              </span>
            </div>
            <p v-if="card.content?.body" class="rc-card__body">
              {{ card.content.body }}
            </p>
            <small class="rc-card__time">
              @{{ card.username }} · {{ formatDate(card.createdAt) }}
            </small>

            <div v-if="interactionsOf(card.id).length" class="rc-interactions">
              <template v-if="card.cardType === 'travel_log'">
                <div class="rc-interaction-line">
                  <span class="rc-kicker">同行名单</span>
                  <span class="rc-interaction-names">
                    {{ signupsOf(card.id).map((i) => i.username).join('、') }}
                  </span>
                </div>
              </template>
              <template v-else-if="card.cardType === 'wish_list'">
                <div
                  v-for="i in [...helpOf(card.id), ...wantOf(card.id)]"
                  :key="i.id"
                  class="rc-interaction-line"
                >
                  <strong>{{ i.username }}</strong>
                  <span>{{ i.kind === 'help' ? '我来帮你' : '我也想要' }}</span>
                </div>
              </template>
              <template v-else-if="card.cardType === 'life_note'">
                <div
                  v-for="c in commentsOf(card.id)"
                  :key="c.id"
                  class="rc-interaction-line"
                >
                  <strong>{{ c.username }}</strong>
                  <span>{{ c.content }}</span>
                </div>
              </template>
            </div>

            <div class="rc-card__interact">
              <button
                v-if="card.cardType === 'travel_log'"
                type="button"
                class="rc-mini"
                @click="doInteraction(card, 'signup')"
              >
                报名参加
              </button>
              <template v-else-if="card.cardType === 'wish_list'">
                <button
                  type="button"
                  class="rc-mini"
                  @click="doInteraction(card, 'help')"
                >
                  我来帮你
                </button>
                <button
                  type="button"
                  class="rc-mini"
                  @click="doInteraction(card, 'want')"
                >
                  我也想要
                </button>
              </template>
              <template v-else-if="card.cardType === 'life_note'">
                <button
                  type="button"
                  class="rc-mini"
                  @click="toggleComment(card.id)"
                >
                  {{ commentOpen[card.id] ? '收起' : '评论' }}
                </button>
                <div v-if="commentOpen[card.id]" class="rc-comment-form">
                  <input
                    v-model="commentInputs[card.id]"
                    maxlength="300"
                    placeholder="写评论…"
                    @keyup.enter="submitComment(card)"
                  />
                  <button
                    type="button"
                    class="rc-mini"
                    @click="submitComment(card)"
                  >
                    发送
                  </button>
                </div>
              </template>
            </div>
          </div>
        </article>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="dialogOpen" class="rc-dialog-backdrop" @mousedown.self="dialogOpen = false">
        <section class="rc-dialog" role="dialog" aria-modal="true">
          <header class="rc-dialog__header">
            <h3>{{ editingId ? '编辑' : '新增' }}{{ currentType.label }}</h3>
            <button
              type="button"
              class="rc-close"
              aria-label="关闭"
              @click="dialogOpen = false"
            >
              ✕
            </button>
          </header>

          <div class="rc-dialog__body">
            <label class="rc-field">
              <span>标题</span>
              <input
                v-model="form.title"
                type="text"
                maxlength="120"
                placeholder="给这条内容起个标题"
              />
            </label>

            <label class="rc-field">
              <span>{{ currentType.bodyLabel }}</span>
              <textarea
                v-model="form.body"
                rows="4"
                maxlength="2000"
                :placeholder="currentType.bodyPlaceholder"
              />
            </label>

            <div
              v-if="currentType.communityVisible"
              class="rc-field rc-field--inline"
            >
              <span>谁可见</span>
              <div class="rc-permissions">
                <label class="rc-perm">
                  <input
                    v-model="form.permission"
                    type="radio"
                    value="self"
                  />
                  <span>仅自己</span>
                </label>
                <label class="rc-perm">
                  <input
                    v-model="form.permission"
                    type="radio"
                    value="residents"
                  />
                  <span>原住民可见</span>
                </label>
              </div>
            </div>

            <label
              v-if="currentType.hasInvite"
              class="rc-field rc-field--inline"
            >
              <span>漫游邀约</span>
              <label class="rc-perm">
                <input v-model="form.inviteOpen" type="checkbox" />
                <span>向邻里发起漫游邀约</span>
              </label>
            </label>

            <p v-if="errorMessage" class="rc-error" role="alert">
              {{ errorMessage }}
            </p>
          </div>

          <footer class="rc-dialog__footer">
            <button type="button" class="rc-button" @click="dialogOpen = false">
              取消
            </button>
            <button
              type="button"
              class="rc-button rc-button--primary"
              :disabled="busy"
              @click="submit"
            >
              {{ busy ? '保存中' : '保存' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.rc-interactions {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.rc-interaction-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}

.rc-interaction-line strong {
  color: rgba(244, 246, 245, 0.85);
}

.rc-interaction-line span {
  color: rgba(244, 246, 245, 0.7);
}

.rc-interaction-names {
  overflow-wrap: anywhere;
}

.rc-card__interact {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.rc-comment-form {
  display: flex;
  gap: 6px;
  width: 100%;
}

.rc-comment-form input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid rgba(244, 246, 245, 0.16);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #f4f6f5;
  font-size: 13px;
}
.rc-panel {
  display: grid;
  gap: 16px;
}

.rc-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.rc-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  border: 1px solid rgba(29, 29, 31, 0.14);
  border-radius: 999px;
  background: transparent;
  color: rgba(29, 29, 31, 0.72);
  cursor: pointer;
  font-size: 14px;
}

.rc-tab--active {
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  border-color: transparent;
  font-weight: 600;
}

.rc-body {
  display: grid;
  gap: 14px;
}

.rc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rc-head__meta {
  display: grid;
  gap: 2px;
}

.rc-head__meta strong {
  font-size: 16px;
}

.rc-head__meta span {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.rc-add {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}

.rc-empty {
  padding: 28px;
  text-align: center;
  color: rgba(29, 29, 31, 0.5);
  border: 1px dashed rgba(29, 29, 31, 0.14);
  border-radius: 12px;
  font-size: 13px;
}

.rc-list {
  display: grid;
  gap: 10px;
}

.rc-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
}

.rc-card__main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.rc-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rc-card__title strong {
  font-size: 15px;
}

.rc-card__body {
  margin: 0;
  color: rgba(29, 29, 31, 0.8);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.rc-card__time {
  color: rgba(29, 29, 31, 0.42);
  font-size: 12px;
}

.rc-card__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.rc-mini {
  padding: 5px 10px;
  border: 1px solid rgba(29, 29, 31, 0.14);
  border-radius: 6px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  cursor: pointer;
  font-size: 12px;
}

.rc-mini--danger {
  color: var(--vu-danger, #e0483b);
  border-color: rgba(242, 166, 160, 0.3);
}

.rc-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.rc-badge--self {
  background: rgba(29, 29, 31, 0.1);
  color: rgba(29, 29, 31, 0.6);
}

.rc-badge--residents {
  background: rgba(47, 168, 79, 0.14);
  color: var(--vu-accent-dark, #258a41);
}

.rc-badge--invite {
  background: rgba(255, 190, 103, 0.16);
  color: var(--vu-gold, #d3a24b);
}

.rc-community {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.rc-community__head {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.rc-card--community {
  border-style: dashed;
}

.rc-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.4);
}

.rc-dialog {
  width: min(480px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(29, 29, 31, 0.12);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.rc-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(29, 29, 31, 0.08);
}

.rc-dialog__header h3 {
  margin: 0;
  font-size: 16px;
}

.rc-close {
  border: none;
  background: transparent;
  color: rgba(29, 29, 31, 0.7);
  cursor: pointer;
  font-size: 16px;
}

.rc-dialog__body {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.rc-field {
  display: grid;
  gap: 6px;
}

.rc-field > span {
  color: rgba(29, 29, 31, 0.65);
  font-size: 13px;
}

.rc-field input,
.rc-field textarea {
  padding: 10px 12px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 14px;
  resize: vertical;
}

.rc-field--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rc-permissions {
  display: flex;
  gap: 12px;
}

.rc-perm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(29, 29, 31, 0.8);
  font-size: 13px;
  cursor: pointer;
}

.rc-error {
  margin: 0;
  color: var(--vu-danger, #e0483b);
  font-size: 13px;
}

.rc-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.rc-button {
  padding: 9px 18px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  cursor: pointer;
}

.rc-button--primary {
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  border-color: transparent;
  font-weight: 600;
}

.rc-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
