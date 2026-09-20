<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { getResidentByAvatarId } from '../data/residents.js';
import { worldStore } from '../stores/worldStore.js';

const props = defineProps({
  resident: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['close']);

const draft = ref('');
const sending = ref(false);
const listRef = ref(null);

const residentName = computed(() => props.resident?.residentName || '居民');
const avatarColor = computed(
  () =>
    getResidentByAvatarId(props.resident?.avatarId)?.avatarColor || '#4f8f7b',
);
const messages = computed(
  () => worldStore.state.residentChats[residentName.value] || [],
);

const scrollToBottom = async () => {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
};

watch(messages, scrollToBottom, { deep: true });

const submit = async () => {
  const content = draft.value.trim().slice(0, 200);

  if (!content || sending.value) {
    return;
  }

  sending.value = true;
  draft.value = '';
  scrollToBottom();

  try {
    await worldStore.sendResidentChat({
      residentName: residentName.value,
      message: content,
    });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
};
</script>

<template>
  <div class="vu-resident-chat">
    <header class="vu-resident-chat__header">
      <span
        class="vu-resident-chat__avatar"
        :style="{ background: avatarColor }"
        aria-hidden="true"
      />
      <div class="vu-resident-chat__meta">
        <strong>{{ residentName }}</strong>
        <small>本宅院住户 · 一对一私聊</small>
      </div>
      <button
        type="button"
        class="vu-resident-chat__close"
        aria-label="关闭居民对话"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div ref="listRef" class="vu-resident-chat__list">
      <p v-if="!messages.length" class="vu-resident-chat__empty">
        和 {{ residentName }} 打个招呼吧～
      </p>
      <div
        v-for="item in messages"
        :key="item.id"
        class="vu-resident-chat__message"
        :class="`is-${item.role}`"
      >
        <span
          v-if="item.role === 'assistant'"
          class="vu-resident-chat__avatar"
          :style="{ background: avatarColor }"
          aria-hidden="true"
        />
        <div class="vu-resident-chat__bubble">{{ item.content }}</div>
      </div>
      <div v-if="sending" class="vu-resident-chat__message is-assistant">
        <span
          class="vu-resident-chat__avatar"
          :style="{ background: avatarColor }"
          aria-hidden="true"
        />
        <div class="vu-resident-chat__bubble is-typing">正在输入…</div>
      </div>
    </div>

    <form class="vu-resident-chat__input" @submit.prevent="submit">
      <input
        v-model="draft"
        maxlength="200"
        placeholder="说点什么…（200 字以内）"
        :disabled="sending"
      />
      <button type="submit" :disabled="sending || !draft.trim()">发送</button>
    </form>
  </div>
</template>

<style scoped>
.vu-resident-chat {
  position: absolute;
  right: 16px;
  bottom: 156px;
  width: 320px;
  max-height: 460px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 12px;
  background: rgba(28, 61, 54, 0.96);
  color: #f3f7f4;
  box-shadow: 0 16px 40px rgba(14, 31, 27, 0.4);
  z-index: 40;
  overflow: hidden;
}

.vu-resident-chat__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}

.vu-resident-chat__avatar {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
}

.vu-resident-chat__meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.vu-resident-chat__meta strong {
  font-size: 14px;
  color: #ffd77c;
}

.vu-resident-chat__meta small {
  font-size: 10px;
  color: #a9bcb5;
}

.vu-resident-chat__close {
  border: none;
  background: transparent;
  color: #cbd8d2;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.vu-resident-chat__list {
  flex: 1;
  min-height: 160px;
  max-height: 300px;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vu-resident-chat__empty {
  margin: auto;
  font-size: 12px;
  color: #a9bcb5;
  text-align: center;
}

.vu-resident-chat__message {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.vu-resident-chat__message.is-user {
  justify-content: flex-end;
}

.vu-resident-chat__message .vu-resident-chat__avatar {
  width: 26px;
  height: 26px;
}

.vu-resident-chat__bubble {
  max-width: 75%;
  padding: 7px 10px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.is-assistant .vu-resident-chat__bubble {
  background: rgba(255, 255, 255, 0.12);
  color: #eef5f1;
  border-bottom-left-radius: 4px;
}

.is-user .vu-resident-chat__bubble {
  background: #2f6b5c;
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.vu-resident-chat__bubble.is-typing {
  opacity: 0.7;
  font-style: italic;
}

.vu-resident-chat__input {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}

.vu-resident-chat__input input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #f3f7f4;
  font-size: 12px;
  padding: 7px 8px;
}

.vu-resident-chat__input button {
  border: 1px solid rgba(255, 218, 125, 0.6);
  border-radius: 6px;
  background: rgba(255, 218, 125, 0.14);
  color: #ffd77c;
  font-size: 12px;
  padding: 7px 12px;
  cursor: pointer;
}

.vu-resident-chat__input button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
