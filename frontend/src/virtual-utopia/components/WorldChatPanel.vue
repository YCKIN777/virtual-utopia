<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { worldStore } from '../stores/worldStore.js';

const open = ref(false);
const input = ref('');
const sending = ref(false);
const listRef = ref(null);
let pollTimer = null;

const messages = computed(() => worldStore.state.worldChat.messages);

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
      世界频道
      <span v-if="messages.length">{{ messages.length }}</span>
    </button>

    <section v-if="open" class="vu-world-chat__panel" aria-label="世界文字聊天">
      <header>
        <div>
          <span class="vu-kicker">WORLD CHAT</span>
          <strong>全局世界频道</strong>
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
          世界频道暂无消息
        </p>
      </div>

      <form @submit.prevent="sendMessage">
        <input
          v-model="input"
          maxlength="200"
          placeholder="发送世界消息"
          :disabled="sending"
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
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  padding: 10px;
  border-top: 1px solid #dfe4dc;
  background: #fff;
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
