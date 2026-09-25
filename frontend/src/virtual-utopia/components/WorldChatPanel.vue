<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { seedResidents } from '../data/residents.js';
import { worldStore } from '../stores/worldStore.js';
import { getChannelLabel } from '../webgl/worldLayout.js';

const emit = defineEmits(['select-resident']);

const open = ref(false);
const input = ref('');
const sending = ref(false);
const listRef = ref(null);
const mentionOpen = ref(false);
const mentionQuery = ref('');
let pollTimer = null;

const messages = computed(() => worldStore.state.worldChat.messages);
const channelLabel = computed(() =>
  getChannelLabel(worldStore.state.worldChat.channel),
);

const matchedResidents = computed(() => {
  const query = mentionQuery.value.trim();

  if (!query) {
    return seedResidents;
  }

  return seedResidents.filter((resident) =>
    resident.residentName.includes(query),
  );
});

// 输入框出现「@名字」片段时，弹出 5 位居民快捷列表。
const syncMention = () => {
  const match = input.value.match(/(?:^|\s)@([^\s@]*)$/);

  if (!match) {
    mentionOpen.value = false;
    return;
  }

  mentionQuery.value = match[1];
  mentionOpen.value = true;
};

// 选中居民：清掉 @ 片段，直接为其打开一对一会话（无需跑过去凑距离）。
const pickResident = (resident) => {
  input.value = input.value.replace(/(?:^|\s)@[^\s@]*$/, '').trimStart();
  mentionOpen.value = false;
  mentionQuery.value = '';

  emit('select-resident', {
    avatarId: resident.avatarId,
    residentName: resident.residentName,
    homePlotId: resident.homePlotId,
  });
};

const scrollToBottom = async () => {
  await nextTick();

  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
};

const sendMessage = async () => {
  const content = input.value.trim();

  if (!content || sending.value) {
    return;
  }

  sending.value = true;
  input.value = '';

  await worldStore.sendWorldChat({ content });
  sending.value = false;
  await scrollToBottom();
};

const formatTime = (value) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const poll = async () => {
  await worldStore.loadWorldChat();
  await scrollToBottom();
};

onMounted(async () => {
  await poll();
  pollTimer = setInterval(poll, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div class="vu-world-chat">
    <button
      type="button"
      class="vu-world-chat__trigger"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ channelLabel }}
      <span v-if="messages.length">{{ messages.length }}</span>
    </button>

    <section v-if="open" class="vu-world-chat__panel" aria-label="世界文字聊天">
      <header>
        <div>
          <span class="vu-kicker">LOCAL CHAT</span>
          <strong>{{ channelLabel }}</strong>
        </div>
        <button type="button" aria-label="关闭世界频道" @click="open = false">
          ×
        </button>
      </header>

      <div ref="listRef" class="vu-world-chat__messages">
        <article v-for="message in messages" :key="message.id">
          <div>
            <strong>{{ message.displayName || message.username }}</strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </div>
          <p>{{ message.content }}</p>
        </article>
        <p v-if="messages.length === 0" class="vu-world-chat__empty">
          {{ channelLabel }}暂无消息
        </p>
      </div>

      <form @submit.prevent="sendMessage">
        <div v-if="mentionOpen" class="vu-world-chat__mentions">
          <p class="vu-world-chat__mentions-title">与居民私聊</p>
          <button
            v-for="resident in matchedResidents"
            :key="resident.avatarId"
            type="button"
            class="vu-world-chat__mention"
            @click="pickResident(resident)"
          >
            <i :style="{ background: resident.avatarColor }" aria-hidden="true" />
            {{ resident.residentName }}
          </button>
          <p
            v-if="!matchedResidents.length"
            class="vu-world-chat__mentions-empty"
          >
            没有匹配的居民
          </p>
        </div>
        <input
          v-model="input"
          maxlength="200"
          placeholder="发送消息到当前位置频道（输入 @ 与居民私聊）"
          :disabled="sending"
          @input="syncMention"
          @keydown.esc="mentionOpen = false"
        />
        <button type="submit" :disabled="sending || !input.trim()">发送</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.vu-world-chat {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 35;
  display: grid;
  justify-items: end;
  gap: 8px;
}

.vu-world-chat__trigger,
.vu-world-chat__panel {
  box-shadow: 0 12px 34px rgba(13, 29, 27, 0.24);
}

.vu-world-chat__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  background: #244f45;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.vu-world-chat__trigger span {
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 11px;
  text-align: center;
}

.vu-world-chat__panel {
  width: min(360px, calc(100vw - 28px));
  height: min(480px, 65vh);
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border: 1px solid rgba(28, 62, 54, 0.22);
  border-radius: 8px;
  background: #f7f5ef;
  color: #243d37;
}

.vu-world-chat__panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #dfe4dc;
  background: #fff;
}

.vu-world-chat__panel header strong {
  display: block;
  margin-top: 2px;
}

.vu-world-chat__panel header button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: #edf1eb;
  color: #41564f;
  font-size: 21px;
  cursor: pointer;
}

.vu-world-chat__messages {
  overflow: auto;
  padding: 12px;
}

.vu-world-chat__messages article {
  margin-bottom: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  background: #fff;
}

.vu-world-chat__messages article div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vu-world-chat__messages article span {
  color: #89958f;
  font-size: 10px;
}

.vu-world-chat__messages article p {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.vu-world-chat__empty {
  color: #8b9791;
  font-size: 12px;
  text-align: center;
}

.vu-world-chat__panel form {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  padding: 10px;
  border-top: 1px solid #dfe4dc;
  background: #fff;
}

.vu-world-chat__mentions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% - 4px);
  z-index: 2;
  display: grid;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
  padding: 8px;
  border: 1px solid rgba(28, 62, 54, 0.2);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 -8px 22px rgba(13, 29, 27, 0.16);
}

.vu-world-chat__mentions-title {
  margin: 0 0 4px;
  color: #89958f;
  font-size: 11px;
}

.vu-world-chat__panel form .vu-world-chat__mention {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #243d37;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.vu-world-chat__panel form .vu-world-chat__mention:hover {
  background: #eef3ee;
}

.vu-world-chat__mention i {
  width: 16px;
  height: 16px;
  flex: none;
  border-radius: 50%;
}

.vu-world-chat__mentions-empty {
  margin: 4px 0;
  color: #8b9791;
  font-size: 12px;
  text-align: center;
}

.vu-world-chat__panel input {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #cfd8d0;
  border-radius: 5px;
  font: inherit;
}

.vu-world-chat__panel form button {
  padding: 8px 13px;
  border: 0;
  border-radius: 5px;
  background: #2d6c5c;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.vu-world-chat__panel form button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 760px) {
  .vu-world-chat {
    right: 12px;
    bottom: 12px;
  }

  .vu-world-chat__panel {
    height: min(430px, 60vh);
  }
}
</style>
