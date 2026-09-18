<script setup>
import { onMounted, reactive, ref } from 'vue';
import ModalDialog from '../components/ModalDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { sceneOptions, sessionTypeOptions } from '../config.js';
import { authStore } from '../stores/authStore.js';

const pageSize = 20;
const api = authStore.api;
const filters = reactive({
  sceneId: '',
  sessionType: '',
  from: '',
  to: '',
});
const sessions = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const page = ref(0);
const selectedSession = ref(null);
const detailOpen = ref(false);
const detailLoading = ref(false);

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const loadSessions = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const payload = await api.listSessions({
      ...filters,
      all: authStore.hasRole('admin') ? 'true' : undefined,
      limit: pageSize,
      offset: page.value * pageSize,
    });

    sessions.value = payload.sessions || [];
  } catch (error) {
    errorMessage.value = error.message || '历史会话加载失败';
  } finally {
    loading.value = false;
  }
};

const applyFilters = async () => {
  page.value = 0;
  await loadSessions();
};

const resetFilters = async () => {
  filters.sceneId = '';
  filters.sessionType = '';
  filters.from = '';
  filters.to = '';
  await applyFilters();
};

const changePage = async (nextPage) => {
  page.value = nextPage;
  await loadSessions();
};

const openSession = async (session) => {
  detailOpen.value = true;
  detailLoading.value = true;
  selectedSession.value = session;

  try {
    selectedSession.value = await api.getSession(session.id);
  } catch (error) {
    errorMessage.value = error.message || '会话详情加载失败';
  } finally {
    detailLoading.value = false;
  }
};

onMounted(loadSessions);
</script>

<template>
  <section class="phase6-page">
    <header class="phase6-page-header">
      <div>
        <p class="phase6-eyebrow">CONVERSATION ARCHIVE</p>
        <h1>历史会话</h1>
        <p>查询持久会话并按场景、类型和时间范围检索消息。</p>
      </div>
    </header>

    <form class="phase6-filter-bar" @submit.prevent="applyFilters">
      <label class="phase6-field phase6-field--compact">
        <span>场景</span>
        <select v-model="filters.sceneId">
          <option
            v-for="option in sceneOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="phase6-field phase6-field--compact">
        <span>类型</span>
        <select v-model="filters.sessionType">
          <option
            v-for="option in sessionTypeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="phase6-field phase6-field--compact">
        <span>开始时间</span>
        <input v-model="filters.from" type="date" />
      </label>

      <label class="phase6-field phase6-field--compact">
        <span>结束时间</span>
        <input v-model="filters.to" type="date" />
      </label>

      <div class="phase6-filter-actions">
        <button type="submit" class="phase6-button phase6-button--secondary">
          查询
        </button>
        <button
          type="button"
          class="phase6-button phase6-button--ghost"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </form>

    <div v-if="errorMessage" class="phase6-alert phase6-alert--error">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="loadSessions">重试</button>
    </div>

    <div class="phase6-table-card">
      <div v-if="loading" class="phase6-loading-state">
        <span class="phase6-spinner" aria-hidden="true" />
        正在加载
      </div>

      <div v-else-if="sessions.length === 0" class="phase6-empty-state">
        <strong>暂无历史会话</strong>
        <span>当前筛选条件下没有可显示的会话。</span>
      </div>

      <div v-else class="phase6-table-scroll">
        <table class="phase6-table">
          <thead>
            <tr>
              <th>会话标题</th>
              <th>场景</th>
              <th>Agent</th>
              <th>类型</th>
              <th>状态</th>
              <th>更新时间</th>
              <th class="phase6-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in sessions" :key="session.id">
              <td>
                <strong class="phase6-primary-cell">
                  {{ session.title || '无标题会话' }}
                </strong>
                <span class="phase6-secondary-cell">
                  {{ session.id }}
                </span>
              </td>
              <td>{{ session.sceneId }}</td>
              <td>{{ session.ownerAgentId }}</td>
              <td>
                {{ session.sessionType === 'private' ? '私聊' : '公开' }}
              </td>
              <td><StatusBadge :value="session.status" /></td>
              <td>{{ formatDate(session.updatedAt) }}</td>
              <td class="phase6-action-cell">
                <button
                  type="button"
                  class="phase6-button phase6-button--secondary phase6-button--small"
                  @click="openSession(session)"
                >
                  查看消息
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="phase6-pagination">
        <span>第 {{ page + 1 }} 页</span>
        <div>
          <button
            type="button"
            class="phase6-button phase6-button--secondary phase6-button--small"
            :disabled="page === 0 || loading"
            @click="changePage(page - 1)"
          >
            上一页
          </button>
          <button
            type="button"
            class="phase6-button phase6-button--secondary phase6-button--small"
            :disabled="sessions.length < pageSize || loading"
            @click="changePage(page + 1)"
          >
            下一页
          </button>
        </div>
      </footer>
    </div>

    <ModalDialog
      :open="detailOpen"
      title="会话详情"
      @close="detailOpen = false"
    >
      <div v-if="detailLoading" class="phase6-loading-state">
        <span class="phase6-spinner" aria-hidden="true" />
        正在加载
      </div>

      <div v-else-if="selectedSession" class="phase6-message-view">
        <div class="phase6-session-meta">
          <strong>
            {{ selectedSession.title || '无标题会话' }}
          </strong>
          <span>
            {{ selectedSession.sceneId }} · {{ selectedSession.ownerAgentId }} ·
            {{ selectedSession.sessionType === 'private' ? '私聊' : '公开' }}
          </span>
        </div>

        <div
          v-if="selectedSession.messages?.length"
          class="phase6-message-list"
        >
          <article
            v-for="(message, index) in selectedSession.messages"
            :key="`${message.role}-${index}`"
            class="phase6-message"
            :class="{
              'phase6-message--user': message.role === 'user',
            }"
          >
            <span>
              {{ message.role === 'user' ? '用户' : 'Agent' }}
            </span>
            <p>{{ message.content }}</p>
          </article>
        </div>

        <div v-else class="phase6-empty-state phase6-empty-state--compact">
          <strong>暂无消息</strong>
        </div>
      </div>
    </ModalDialog>
  </section>
</template>
