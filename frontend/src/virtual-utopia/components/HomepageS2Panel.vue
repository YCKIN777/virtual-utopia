<script setup>
import { computed, onMounted, ref } from 'vue';
import { worldStore } from '../stores/worldStore.js';

const TYPE_LABELS = {
  work_plan: '工作计划',
  travel_log: '出游记录',
  life_note: '生活随记',
  wish_list: '心愿清单',
};

const board = computed(() => worldStore.state.board);
const guestbook = computed(() => worldStore.state.guestbook);

const content = ref('');
const busy = ref(false);
const errorMessage = ref('');

const typeLabel = (cardType) => TYPE_LABELS[cardType] || cardType;

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const submit = async () => {
  const text = content.value.trim();

  if (!text) {
    errorMessage.value = '请先写点内容';
    return;
  }

  busy.value = true;
  errorMessage.value = '';

  const result = await worldStore.createGuestbookMessage(text);

  busy.value = false;

  if (!result.ok) {
    errorMessage.value = result.error || '留言失败';
    return;
  }

  content.value = '';
};

const removeMessage = async (message) => {
  await worldStore.deleteGuestbookMessage(message.id);
};

onMounted(() => {
  worldStore.loadResidentBoard();
  worldStore.loadGuestbook();
});
</script>

<template>
  <section class="s2-panel">
    <div class="s2-block">
      <header class="s2-head">
        <div>
          <strong>个人展示板</strong>
          <span>聚合你标记为「原住民可见」的公开内容，供邻里查看</span>
        </div>
      </header>

      <div v-if="!board.items.length" class="s2-empty">
        还没有公开内容。去「我的主页卡片」里把内容设为「原住民可见」即可展示。
      </div>

      <div v-else class="s2-list">
        <article v-for="item in board.items" :key="item.id" class="s2-item">
          <div class="s2-item__head">
            <span class="s2-type">{{ typeLabel(item.cardType) }}</span>
            <strong>{{ item.content?.title || '（无标题）' }}</strong>
          </div>
          <p v-if="item.content?.body" class="s2-item__body">
            {{ item.content.body }}
          </p>
          <small class="s2-item__time">{{ formatDate(item.createdAt) }}</small>
        </article>
      </div>
    </div>

    <div class="s2-block">
      <header class="s2-head">
        <div>
          <strong>邻里留言簿</strong>
          <span>仅原住民可读写，无点赞与排行，自愿留言</span>
        </div>
      </header>

      <form class="s2-form" @submit.prevent="submit">
        <textarea
          v-model="content"
          rows="3"
          maxlength="300"
          placeholder="给邻里留句话……"
        />
        <div class="s2-form__row">
          <span v-if="errorMessage" class="s2-error">{{ errorMessage }}</span>
          <button
            type="submit"
            class="s2-submit"
            :disabled="busy"
          >
            {{ busy ? '提交中' : '留言' }}
          </button>
        </div>
      </form>

      <div v-if="!guestbook.messages.length" class="s2-empty">
        还没有留言，来留第一条吧。
      </div>

      <div v-else class="s2-list">
        <article
          v-for="message in guestbook.messages"
          :key="message.id"
          class="s2-item s2-item--message"
        >
          <div class="s2-item__head">
            <strong>@{{ message.fromUsername }}</strong>
            <small class="s2-item__time">{{ formatDate(message.createdAt) }}</small>
          </div>
          <p class="s2-item__body">{{ message.content }}</p>
          <button
            type="button"
            class="s2-delete"
            @click="removeMessage(message)"
          >
            删除
          </button>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.s2-panel {
  display: grid;
  gap: 22px;
}

.s2-block {
  display: grid;
  gap: 12px;
}

.s2-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.s2-head > div {
  display: grid;
  gap: 2px;
}

.s2-head strong {
  font-size: 16px;
}

.s2-head span {
  color: rgba(244, 246, 245, 0.55);
  font-size: 12px;
}

.s2-empty {
  padding: 24px;
  text-align: center;
  color: rgba(244, 246, 245, 0.5);
  border: 1px dashed rgba(244, 246, 245, 0.14);
  border-radius: 12px;
  font-size: 13px;
}

.s2-list {
  display: grid;
  gap: 10px;
}

.s2-item {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid rgba(244, 246, 245, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.s2-item__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.s2-item__head strong {
  font-size: 15px;
}

.s2-type {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(191, 232, 210, 0.16);
  color: #bfe8d2;
  font-size: 11px;
}

.s2-item__body {
  margin: 0;
  color: rgba(244, 246, 245, 0.8);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.s2-item__time {
  color: rgba(244, 246, 245, 0.42);
  font-size: 12px;
}

.s2-item--message {
  position: relative;
}

.s2-delete {
  position: absolute;
  top: 12px;
  right: 14px;
  padding: 4px 10px;
  border: 1px solid rgba(242, 166, 160, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #f2a6a0;
  cursor: pointer;
  font-size: 12px;
}

.s2-form {
  display: grid;
  gap: 10px;
}

.s2-form textarea {
  padding: 10px 12px;
  border: 1px solid rgba(244, 246, 245, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #f4f6f5;
  font-size: 14px;
  resize: vertical;
}

.s2-form__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.s2-error {
  color: #f2a6a0;
  font-size: 13px;
}

.s2-submit {
  margin-left: auto;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: var(--vu-accent, #bfe8d2);
  color: #13231f;
  font-weight: 600;
  cursor: pointer;
}

.s2-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
