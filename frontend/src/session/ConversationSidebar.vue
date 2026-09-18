<script>
import { createSessionStore } from './sessionStore.js';
import { createSessionApi } from './sessionApi.js';
import { openConversation } from './sessionUtils.js';

export default {
  name: 'ConversationSidebar',
  props: {
    api: { type: Object, default: null },
    store: { type: Object, default: null },
    baseUrl: { type: String, default: '' },
  },
  data() {
    return {
      conversations: [],
      loading: false,
      error: '',
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
  async mounted() {
    this.userId = this.storeClient.ensureUserId();
    await this.refresh();
  },
  methods: {
    async refresh() {
      this.loading = true;
      this.error = '';
      try {
        const data = await this.apiClient.listConversations(this.userId);
        this.conversations = data.conversations || [];
        this.storeClient.setConversations(this.conversations);
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
        this.conversations = this.storeClient.getConversations();
      } finally {
        this.loading = false;
      }
    },
    onOpenConversation(conv) {
      openConversation({ conversationId: conv.id, base: this.pageBaseUrl });
    },
  },
};
</script>

<template>
  <aside class="conversation-sidebar">
    <header class="sidebar-header">
      <h3>会话列表</h3>
      <button type="button" @click="refresh">刷新</button>
    </header>
    <p v-if="loading" class="hint">加载中…</p>
    <p v-if="error" class="error">{{ error }}</p>
    <ul v-if="!loading" class="conversation-list">
      <li v-for="conv in conversations" :key="conv.id">
        <a href="#" @click.prevent="onOpenConversation(conv)">
          {{ conv.title || conv.id }}
        </a>
      </li>
    </ul>
    <p v-if="!loading && !error && conversations.length === 0" class="hint">
      暂无历史会话
    </p>
  </aside>
</template>

<style scoped>
.conversation-sidebar {
  width: 240px;
  padding: 12px;
  border-right: 1px solid #e5e5e5;
  overflow-y: auto;
}
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.conversation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.conversation-list li {
  margin: 4px 0;
}
.hint {
  color: #888;
}
.error {
  color: #c0392b;
}
</style>
