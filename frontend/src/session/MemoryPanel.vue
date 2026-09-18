<script>
import { createSessionStore } from './sessionStore.js';
import { createSessionApi } from './sessionApi.js';

/**
 * H5 记忆管理面板：加载用户长期记忆列表，支持单条删除与一键清空。
 * 复用 sessionStore 的 userId 鉴权（localStorage 持久化），独立组件，不触碰冻结 3D 场景。
 */
export default {
  name: 'MemoryPanel',
  props: {
    api: { type: Object, default: null },
    store: { type: Object, default: null },
  },
  data() {
    return {
      memories: [],
      loading: false,
      error: '',
      userId: '',
      deletingId: null,
      clearing: false,
    };
  },
  computed: {
    apiClient() {
      return this.api || createSessionApi();
    },
    storeClient() {
      return this.store || createSessionStore();
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
        const data = await this.apiClient.listMemories(this.userId);
        this.memories = data.memories || [];
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
      } finally {
        this.loading = false;
      }
    },
    async onDelete(memory) {
      if (this.deletingId) return;
      this.deletingId = memory.id;
      this.error = '';
      try {
        await this.apiClient.deleteMemory(memory.id);
        this.memories = this.memories.filter((m) => m.id !== memory.id);
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
      } finally {
        this.deletingId = null;
      }
    },
    async onClearAll() {
      if (this.clearing) return;
      if (
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm('确定清空全部记忆？此操作不可撤销。')
      ) {
        return;
      }
      this.clearing = true;
      this.error = '';
      try {
        await this.apiClient.clearMemories(this.userId);
        this.memories = [];
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
      } finally {
        this.clearing = false;
      }
    },
  },
};
</script>

<template>
  <section class="memory-panel">
    <header class="panel-header">
      <h3>我的长期记忆</h3>
      <div class="actions">
        <button type="button" @click="refresh">刷新</button>
        <button
          type="button"
          :disabled="clearing || memories.length === 0"
          @click="onClearAll"
        >
          清空全部
        </button>
      </div>
    </header>

    <p v-if="loading" class="hint">加载中…</p>
    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="!loading" class="memory-list">
      <li v-for="m in memories" :key="m.id" class="memory-item">
        <span class="category">[{{ m.category }}]</span>
        <span class="content">{{ m.content }}</span>
        <button
          type="button"
          :disabled="deletingId === m.id"
          @click="onDelete(m)"
        >
          {{ deletingId === m.id ? '删除中…' : '删除' }}
        </button>
      </li>
    </ul>

    <p v-if="!loading && !error && memories.length === 0" class="hint">
      暂无长期记忆
    </p>
  </section>
</template>

<style scoped>
.memory-panel {
  padding: 16px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.actions {
  display: flex;
  gap: 8px;
}
.memory-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}
.memory-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.category {
  color: #888;
  flex-shrink: 0;
}
.content {
  flex: 1;
}
.hint {
  color: #888;
}
.error {
  color: #c0392b;
}
</style>
