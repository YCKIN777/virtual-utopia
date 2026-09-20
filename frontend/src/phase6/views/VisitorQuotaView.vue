<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import StatusBadge from '../components/StatusBadge.vue';
import { authStore } from '../stores/authStore.js';

const api = authStore.api;
const stats = ref(null);
const residents = ref([]);
const invitations = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const form = reactive({
  userId: '',
  username: '',
  displayName: '',
  homePlotId: '',
});

const invitationStatusLabel = (status) => {
  const labels = {
    issued: '待兑换',
    used: '已兑换',
    revoked: '已回收',
  };

  return labels[status] || status;
};

const channelLabel = (channel) =>
  channel === 'admin' ? '城主公共' : '原住民';

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const load = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const payload = await api.getVisitorQuotaStats();
    stats.value = payload.stats || null;
    residents.value = payload.residents || [];
    invitations.value = payload.invitations || [];
  } catch (error) {
    errorMessage.value = error.message || '访客名额数据加载失败';
  } finally {
    loading.value = false;
  }
};

const onboardResident = async () => {
  const userId = Number.parseInt(form.userId, 10);

  if (!Number.isFinite(userId) || userId <= 0) {
    errorMessage.value = '请填写有效的原住民 userId';
    return;
  }

  try {
    await api.onboardResident({
      userId,
      username: form.username,
      displayName: form.displayName,
      homePlotId: form.homePlotId,
    });
    form.userId = '';
    form.username = '';
    form.displayName = '';
    form.homePlotId = '';
    await load();
  } catch (error) {
    errorMessage.value = error.message || '入住原住民失败';
  }
};

const departResident = async (resident) => {
  try {
    await api.departResident(resident.userId);
    await load();
  } catch (error) {
    errorMessage.value = error.message || '原住民迁出失败';
  }
};

const issueAdminInvitation = async () => {
  try {
    await api.issueAdminInvitation();
    await load();
  } catch (error) {
    errorMessage.value = error.message || '发放公共名额失败';
  }
};

const removeVisitor = async (invitation) => {
  if (!invitation.visitorUserId) {
    return;
  }

  try {
    await api.removeVisitor(invitation.visitorUserId);
    await load();
  } catch (error) {
    errorMessage.value = error.message || '移除访客失败';
  }
};

const statCards = computed(() => {
  const value = stats.value;

  if (!value) {
    return [];
  }

  return [
    { label: '原住民', value: value.activeResidentCount, unit: '/ 50' },
    {
      label: '原住民已发名额',
      value: value.residentIssuedCount,
      unit: '/ 150',
    },
    { label: '城主公共名额', value: value.adminIssuedCount, unit: '个' },
    { label: '访客总数', value: value.totalVisitors, unit: '/ 200' },
    {
      label: '剩余访客容量',
      value: value.remainingVisitorCapacity,
      unit: '人',
    },
  ];
});

onMounted(load);
</script>

<template>
  <section class="phase6-page">
    <header class="phase6-page-header">
      <div>
        <p class="phase6-eyebrow">VISITOR QUOTA</p>
        <h1>访客名额统计</h1>
        <p>管理原住民入住、访客邀请名额发放与全局访客上限。</p>
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

    <template v-else-if="stats">
      <div class="quota-stat-grid">
        <article v-for="card in statCards" :key="card.label" class="quota-stat">
          <strong>{{ card.value }}</strong>
          <span>{{ card.label }}</span>
          <small>{{ card.unit }}</small>
        </article>
      </div>

      <div class="quota-gate">
        <span
          class="phase6-status"
          :class="stats.residentEntryOpen ? 'phase6-status--success' : 'phase6-status--warning'"
        >
          {{ stats.residentEntryOpen ? '原住民邀请入口开放' : '原住民邀请入口已关闭（仅城主可发）' }}
        </span>
        <span
          class="phase6-status"
          :class="stats.globalEntryOpen ? 'phase6-status--success' : 'phase6-status--danger'"
        >
          {{ stats.globalEntryOpen ? '全局访客入口开放' : '全局访客已满（200）' }}
        </span>
      </div>

      <div class="phase6-table-card">
        <header class="quota-section-head">
          <div>
            <strong>原住民管理</strong>
            <span>上限 50 人，每位 3 个访客名额</span>
          </div>
        </header>

        <form class="phase6-filter-bar" @submit.prevent="onboardResident">
          <label class="phase6-field phase6-field--compact">
            <span>userId</span>
            <input v-model="form.userId" type="number" min="1" placeholder="1" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>用户名</span>
            <input v-model="form.username" placeholder="username" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>显示名</span>
            <input v-model="form.displayName" placeholder="显示名" />
          </label>
          <label class="phase6-field phase6-field--compact">
            <span>家园地块</span>
            <input v-model="form.homePlotId" placeholder="plot-3" />
          </label>
          <div class="phase6-filter-actions">
            <button type="submit" class="phase6-button phase6-button--primary">
              入住原住民
            </button>
          </div>
        </form>

        <div v-if="residents.length" class="phase6-table-scroll">
          <table class="phase6-table">
            <thead>
              <tr>
                <th>userId</th>
                <th>显示名</th>
                <th>用户名</th>
                <th>地块</th>
                <th>名额</th>
                <th>状态</th>
                <th class="phase6-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="resident in residents" :key="resident.userId">
                <td>{{ resident.userId }}</td>
                <td>{{ resident.displayName || '-' }}</td>
                <td>{{ resident.username }}</td>
                <td>{{ resident.homePlotId || '-' }}</td>
                <td>{{ resident.quotaTotal }}</td>
                <td><StatusBadge :value="resident.status" /></td>
                <td class="phase6-action-cell">
                  <button
                    v-if="resident.status === 'active'"
                    type="button"
                    class="phase6-button phase6-button--danger phase6-button--small"
                    @click="departResident(resident)"
                  >
                    迁出
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="phase6-empty-state phase6-empty-state--compact">
          <strong>暂无原住民</strong>
        </div>
      </div>

      <div class="phase6-table-card">
        <header class="quota-section-head">
          <div>
            <strong>访客邀请名额</strong>
            <span>原住民渠道 + 城主公共渠道</span>
          </div>
          <button
            type="button"
            class="phase6-button phase6-button--primary phase6-button--small"
            :disabled="!stats.globalEntryOpen"
            @click="issueAdminInvitation"
          >
            发放公共名额
          </button>
        </header>

        <div v-if="invitations.length" class="phase6-table-scroll">
          <table class="phase6-table">
            <thead>
              <tr>
                <th>邀请码</th>
                <th>渠道</th>
                <th>状态</th>
                <th>访客</th>
                <th>发放时间</th>
                <th class="phase6-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invitation in invitations" :key="invitation.id">
                <td>
                  <strong class="phase6-primary-cell">{{ invitation.code }}</strong>
                </td>
                <td>{{ channelLabel(invitation.channel) }}</td>
                <td><StatusBadge :value="invitation.status" /></td>
                <td>{{ invitation.visitorDisplayName || '-' }}</td>
                <td>{{ formatDate(invitation.createdAt) }}</td>
                <td class="phase6-action-cell">
                  <button
                    v-if="invitation.status === 'used' && invitation.visitorUserId"
                    type="button"
                    class="phase6-button phase6-button--danger phase6-button--small"
                    @click="removeVisitor(invitation)"
                  >
                    移除访客
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="phase6-empty-state phase6-empty-state--compact">
          <strong>暂无访客邀请记录</strong>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.quota-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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

.quota-gate {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.quota-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--phase6-border, rgba(255, 255, 255, 0.08));
}

.quota-section-head div {
  display: grid;
  gap: 2px;
}

.quota-section-head span {
  color: rgba(244, 246, 245, 0.55);
  font-size: 12px;
}

.phase6-filter-bar {
  padding: 12px 16px;
}

@media (max-width: 900px) {
  .quota-stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
