<script>
import { createSessionStore } from './sessionStore.js';
import { createSessionApi } from './sessionApi.js';
import {
  parseConversationIdFromUrl,
  updateUrlConversationId,
} from './sessionUtils.js';

export default {
  name: 'ChatPanel',
  props: {
    api: { type: Object, default: null },
    store: { type: Object, default: null },
    baseUrl: { type: String, default: '' },
  },
  data() {
    return {
      messages: [],
      draft: '',
      sending: false,
      conversationId: null,
      userId: '',
    };
  },
  computed: {
    apiClient() {
      return this.api || createSessionApi();
    },
    storeClient() {
      return this.store || createSessionStore();
    },
    pageBaseUrl() {
      return (
        this.baseUrl ||
        (typeof window !== 'undefined' ? window.location.href : 'http://localhost:5173/session')
      );
    },
  },
  mounted() {
    this.userId = this.storeClient.ensureUserId();
    const fromUrl = parseConversationIdFromUrl(this.pageBaseUrl);
    this.conversationId =
      fromUrl || this.storeClient.getCurrentConversationId();
    if (this.conversationId) {
      this.loadHistory(this.conversationId);
    }
  },
  methods: {
    async loadHistory(id) {
      try {
        const data = await this.apiClient.getConversation(id);
        this.messages = data.messages || [];
      } catch {
        // 加载失败保持空列表，不阻塞输入
      }
    },
    async send() {
      const text = this.draft.trim();
      if (!text || this.sending) return;
      this.sending = true;
      this.messages.push({ role: 'user', content: text });
      this.draft = '';
      try {
        const result = await this.apiClient.chat({
          userId: this.userId,
          conversationId: this.conversationId || undefined,
          message: text,
        });
        this.conversationId = result.conversationId;
        this.storeClient.setCurrentConversationId(this.conversationId);
        this.storeClient.appendConversation({
          id: this.conversationId,
          title: text.slice(0, 20),
        });
        this.messages.push({ role: 'assistant', content: result.reply });
        updateUrlConversationId({
          conversationId: this.conversationId,
          base: this.pageBaseUrl,
        });
      } catch (e) {
        this.messages.push({
          role: 'assistant',
          content: '[发送失败] ' + (e && e.message ? e.message : String(e)),
        });
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>

<template>
  <section class="chat-panel">
    <div class="messages">
      <div
        v-for="(m, i) in messages"
        :key="i"
        :class="'msg msg-' + m.role"
      >
        {{ m.content }}
      </div>
    </div>
    <form class="composer" @submit.prevent="send">
      <input
        v-model="draft"
        type="text"
        placeholder="输入消息…"
        :disabled="sending"
      />
      <button type="submit" :disabled="sending">发送</button>
    </form>
  </section>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.msg-user {
  text-align: right;
}
.msg-assistant {
  text-align: left;
}
.composer {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid #e5e5e5;
}
.composer input {
  flex: 1;
}
</style>
