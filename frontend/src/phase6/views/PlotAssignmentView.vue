<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import StatusBadge from '../components/StatusBadge.vue';
import { authStore } from '../stores/authStore.js';

const api = authStore.api;
const plots = ref([]);
const stats = ref(null);
const loading = ref(false);
const errorMessage = ref('');

const form = reactive({
  plotNumber: '',
  residentUserId: '',
  residentUsername: '',
  residentDisplayName: '',
  customName: '',
});

const statCards = computed(() => {
  if (!stats.value) {
    return [];
  }

  return [
    { label: '宅院总数', value: stats.value.total, unit: '套' },
    { label: '已分配', value: stats.value.assigned, unit: '套' },
    { label: '待分配', value: stats.value.vacant, unit: '套' },
  ];
});

const load = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const payload = await api.listPlots();
    plots.value = payload.plots || [];
    stats.value = payload.stats || null;
  } catch (error) {
    errorMessage.value = error.message || '宅院数据加载失败';
  } finally {
    loading.value = false;
  }
};

const assignPlot = async () => {
  const plotNumber = Number.parseInt(form.plotNumber, 10);
  const residentUserId = Number.parseInt(form.residentUserId, 10);

  if (!Number.isFinite(plotNumber) || !Number.isFinite(residentUserId)) {
    errorMessage.value = '请填写有效的宅院编号与居民 userId';
    return;
  }

  try {
    await api.assignPlot({
      plotNumber,
      residentUserId,
      residentUsername: form.residentUsername,
      residentDisplayName: form.residentDisplayName,
      customName: form.customName,
    });
    form.plotNumber = '';
    form.residentUserId = '';
    form.residentUsername = '';
    form.residentDisplayName = '';
    form.customName = '';
    await load();
  } catch (error) {
    errorMessage.value = error.message || '分配宅院失败';
  }
};

const revokePlot = async (plot) => {
  try {
    await api.revokePlot(plot.plotNumber);
    await load();
  } catch (error) {
    errorMessage.value = error.message || '回收宅院失败';
  }
};

const renamePlot = async (plot) => {
  const name = globalThis.prompt('输入居民自定义宅院名：', plot.customName || '');

  if (name === null) {
    return;
  }

  try {
    await api.renamePlot(plot.plotNumber, name.trim());
    await load();
  } catch (error) {
    errorMessage.value = error.message || '重命名宅院失败';
  }
};

onMounted(load);
</script>

<template>
  <section class="phase6-page">
    <header class="phase6-page-header">
      <div>
        <p class="phase6-eyebrow">PLOT ASSIGNMENT</p>
        <h1>宅院绑定分配</h1>
        <p>1~50 固定编号，一户一宅，支持居民自定义宅院名。</p>
      </div>
    </header>

    <div v-if="errorMessage" class="phase6-alert phase6-alert--error">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="load">重试</button>
    </div>

    <div v-if="loading" class="phase6-loading-state">
      <span class="phase6-spinner" aria-hidden="true" />
      正在加载
    </div>

    <template v-else>
      <div class="quota-stat-grid">
        <article v-for="card in statCards" :key="card.label" class="quota-stat">
          <strong>{{ card.value }}</strong>
          <span>{{ card.label }}</span>
          <small>{{ card.unit }}</small>
        </article>
      </div>

      <div class="phase6-table-card">
        <form class="phase6-filter-bar" @submit.prevent="assignPlot">
          <label class="phase6-field phase6-field--compact">
            <span>宅院编号(1~50)</span>
            <input v-model="form.plotNumber" type="number" min="1" max="50" placeholder="7" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>居民 userId</span>
            <input v-model="form.residentUserId" type="number" min="1" placeholder="2" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>用户名</span>
            <input v-model="form.residentUsername" placeholder="username" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>显示名</span>
            <input v-model="form.residentDisplayName" placeholder="显示名" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>自定义宅院名</span>
            <input v-model="form.customName" placeholder="风铃的家" />
          </label>
          <div class="phase6-filter-actions">
            <button type="submit" class="phase6-button phase6-button--primary">
              分配宅院
            </button>
          </div>
        </form>

        <div v-if="plots.length" class="phase6-table-scroll">
          <table class="phase6-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>状态</th>
                <th>居民</th>
                <th>用户名</th>
                <th>自定义宅院名</th>
                <th class="phase6-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plot in plots" :key="plot.plotNumber">
                <td><strong class="phase6-primary-cell">{{ plot.plotNumber }} 号宅院</strong></td>
                <td><StatusBadge :value="plot.status" /></td>
                <td>{{ plot.residentDisplayName || '-' }}</td>
                <td>{{ plot.residentUsername || '-' }}</td>
                <td>{{ plot.customName || '-' }}</td>
                <td class="phase6-action-cell">
                  <template v-if="plot.status === 'assigned'">
                    <button
                      type="button"
                      class="phase6-button phase6-button--secondary phase6-button--small"
                      @click="renamePlot(plot)"
                    >
                      命名
                    </button>
                    <button
                      type="button"
                      class="phase6-button phase6-button--danger phase6-button--small"
                      @click="revokePlot(plot)"
                    >
                      回收
                    </button>
                  </template>
                  <span v-else class="phase6-secondary-cell">待分配</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.quota-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.quota-stat {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--phase6-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: var(--phase6-card, rgba(255, 255, 255, 0.03));
}

.quota-stat strong {
  font-size: 26px;
  line-height: 1;
}

.quota-stat span {
  color: rgba(244, 246, 245, 0.72);
  font-size: 12px;
}

.quota-stat small {
  color: rgba(244, 246, 245, 0.5);
  font-size: 11px;
}

.phase6-filter-bar {
  padding: 12px 16px;
}

@media (max-width: 900px) {
  .quota-stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
