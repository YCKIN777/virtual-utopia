<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import ModalDialog from '../components/ModalDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { authStore } from '../stores/authStore.js';

const api = authStore.api;
const applications = ref([]);
const residents = ref([]);
const stats = ref(null);
const loading = ref(false);
const errorMessage = ref('');
const toast = ref('');

const resetDialog = reactive({
  open: false,
  userId: null,
  username: '',
  password: '',
  error: '',
  busy: false,
});

const rejectDialog = reactive({
  open: false,
  application: null,
  reason: '',
  error: '',
  busy: false,
});

const notify = (message) => {
  toast.value = message;
  setTimeout(() => {
    if (toast.value === message) {
      toast.value = '';
    }
  }, 3200);
};

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

const residentLimitReached = computed(() => {
  if (!stats.value) {
    return false;
  }

  return stats.value.activeResidentCount >= stats.value.residentLimit;
});

const load = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const [applicationsPayload, residentsPayload, statsPayload] =
      await Promise.all([
        api.listResidentApplications(),
        api.listResidents(),
        api.getVisitorQuotaStats(),
      ]);

    applications.value = applicationsPayload.applications || [];
    residents.value = residentsPayload.residents || [];
    stats.value = statsPayload.stats || null;
  } catch (error) {
    errorMessage.value = error.message || '入驻申请数据加载失败';
  } finally {
    loading.value = false;
  }
};

const approveApplication = async (application) => {
  try {
    await api.approveResidentApplication(application.id, {
      username: application.username,
      displayName: application.displayName,
    });
    notify(`已批准 ${application.username} 入驻`);
    await load();
  } catch (error) {
    errorMessage.value = error.message || '批准入驻失败';
  }
};

const rejectApplication = async () => {
  if (!rejectDialog.application) {
    return;
  }

  rejectDialog.busy = true;
  rejectDialog.error = '';

  try {
    await api.rejectResidentApplication(
      rejectDialog.application.id,
      rejectDialog.reason.trim(),
    );
    notify(`已驳回 ${rejectDialog.application.username} 的申请`);
    rejectDialog.open = false;
    rejectDialog.application = null;
    await load();
  } catch (error) {
    rejectDialog.error = error.message || '驳回申请失败';
  } finally {
    rejectDialog.busy = false;
  }
};

const openRejectDialog = (application) => {
  rejectDialog.application = application;
  rejectDialog.reason = '';
  rejectDialog.error = '';
  rejectDialog.open = true;
};

const departResident = async (resident) => {
  try {
    await api.departResident(resident.userId);
    notify(`${resident.username} 已迁出，宅院与名额已回收`);
    await load();
  } catch (error) {
    errorMessage.value = error.message || '迁出回收失败';
  }
};

const openResetDialog = (resident) => {
  resetDialog.userId = resident.userId;
  resetDialog.username = resident.username;
  resetDialog.password = '';
  resetDialog.error = '';
  resetDialog.open = true;
};

const submitResetPassword = async () => {
  const password = resetDialog.password;

  if (!password || password.length < 6) {
    resetDialog.error = '新密码至少需要 6 个字符';
    return;
  }

  resetDialog.busy = true;
  resetDialog.error = '';

  try {
    await api.resetResidentPassword(resetDialog.userId, password);
    resetDialog.open = false;
    notify(`已重置 ${resetDialog.username} 的密码`);
  } catch (error) {
    resetDialog.error = error.message || '重置密码失败';
  } finally {
    resetDialog.busy = false;
  }
};

onMounted(load);
</script>

<template>
  <section class="phase6-page">
    <header class="phase6-page-header">
      <div>
        <p class="phase6-eyebrow">RESIDENT APPLICATIONS</p>
        <h1>入驻申请管理</h1>
        <p>审核居民自助注册申请，批准后自动分配空置宅院并占用原住民名额。</p>
      </div>
    </header>

    <div v-if="toast" class="phase6-alert phase6-alert--success">
      <span>{{ toast }}</span>
    </div>

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
        <article class="quota-stat">
          <strong>{{ stats?.activeResidentCount ?? 0 }}</strong>
          <span>原住民</span>
          <small>/ {{ stats?.residentLimit ?? 50 }}</small>
        </article>
        <article class="quota-stat">
          <strong>{{ applications.length }}</strong>
          <span>待审核申请</span>
          <small>等待 KIN 处理</small>
        </article>
      </div>

      <div
        v-if="residentLimitReached"
        class="phase6-alert phase6-alert--warning"
      >
        <span>原住民已达 {{ stats.residentLimit }} 人上限，无法再批准新申请。</span>
      </div>

      <div class="phase6-table-card">
        <header class="quota-section-head">
          <div>
            <strong>待审核申请</strong>
            <span>居民自主注册提交的入驻申请</span>
          </div>
        </header>

        <div v-if="applications.length" class="phase6-table-scroll">
          <table class="phase6-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>昵称</th>
                <th>爱好</th>
                <th>职业</th>
                <th>自我介绍</th>
                <th>联系标识</th>
                <th>家庭住址</th>
                <th>提交时间</th>
                <th class="phase6-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="application in applications" :key="application.id">
                <td>
                  <strong class="phase6-primary-cell">
                    {{ application.username }}
                  </strong>
                </td>
                <td>{{ application.displayName || '-' }}</td>
                <td>{{ application.hobbies || '-' }}</td>
                <td>{{ application.occupation || '-' }}</td>
                <td class="phase6-cell-wrap">{{ application.selfIntro || '-' }}</td>
                <td>{{ application.contact || '-' }}</td>
                <td>{{ application.address || '-' }}</td>
                <td>{{ formatDate(application.createdAt) }}</td>
                <td class="phase6-action-cell">
                  <button
                    type="button"
                    class="phase6-button phase6-button--primary phase6-button--small"
                    :disabled="residentLimitReached"
                    :title="
                      residentLimitReached ? '名额已满，无法批准' : '批准入驻'
                    "
                    @click="approveApplication(application)"
                  >
                    批准入驻
                  </button>
                  <button
                    type="button"
                    class="phase6-button phase6-button--danger phase6-button--small"
                    @click="openRejectDialog(application)"
                  >
                    驳回申请
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="phase6-empty-state phase6-empty-state--compact">
          <strong>暂无待审核申请</strong>
        </div>
      </div>

      <div class="phase6-table-card">
        <header class="quota-section-head">
          <div>
            <strong>已通过居民</strong>
            <span>绑定宅院编号，支持密码重置与迁出回收</span>
          </div>
        </header>

        <div v-if="residents.length" class="phase6-table-scroll">
          <table class="phase6-table">
            <thead>
              <tr>
                <th>userId</th>
                <th>用户名</th>
                <th>显示名</th>
                <th>爱好</th>
                <th>职业</th>
                <th>自我介绍</th>
                <th>宅院</th>
                <th>状态</th>
                <th class="phase6-action-cell">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="resident in residents" :key="resident.userId">
                <td>{{ resident.userId }}</td>
                <td>
                  <strong class="phase6-primary-cell">
                    {{ resident.username }}
                  </strong>
                </td>
                <td>{{ resident.displayName || '-' }}</td>
                <td>{{ resident.hobbies || '-' }}</td>
                <td>{{ resident.occupation || '-' }}</td>
                <td class="phase6-cell-wrap">{{ resident.selfIntro || '-' }}</td>
                <td>{{ resident.homePlotId || '-' }}</td>
                <td><StatusBadge :value="resident.status" /></td>
                <td class="phase6-action-cell">
                  <template v-if="resident.status === 'active'">
                    <button
                      type="button"
                      class="phase6-button phase6-button--small"
                      @click="openResetDialog(resident)"
                    >
                      重置密码
                    </button>
                    <button
                      type="button"
                      class="phase6-button phase6-button--danger phase6-button--small"
                      @click="departResident(resident)"
                    >
                      迁出回收
                    </button>
                  </template>
                  <span v-else class="phase6-muted">已迁出</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="phase6-empty-state phase6-empty-state--compact">
          <strong>暂无已通过居民</strong>
        </div>
      </div>
    </template>

    <ModalDialog
      :open="resetDialog.open"
      title="重置居民密码"
      @close="resetDialog.open = false"
    >
      <div class="phase6-form-stack">
        <p class="phase6-muted">
          为居民 <strong>{{ resetDialog.username }}</strong> 设置新密码。用户名不可修改。
        </p>
        <label class="phase6-field">
          <span>新密码</span>
          <input
            v-model="resetDialog.password"
            type="password"
            placeholder="至少 6 个字符"
            autocomplete="new-password"
          />
          <small v-if="resetDialog.error" class="phase6-field__error">
            {{ resetDialog.error }}
          </small>
        </label>
      </div>
      <template #footer>
        <button
          type="button"
          class="phase6-button"
          @click="resetDialog.open = false"
        >
          取消
        </button>
        <button
          type="button"
          class="phase6-button phase6-button--primary"
          :disabled="resetDialog.busy"
          @click="submitResetPassword"
        >
          {{ resetDialog.busy ? '提交中' : '确认重置' }}
        </button>
      </template>
    </ModalDialog>

    <ModalDialog
      :open="rejectDialog.open"
      title="驳回申请"
      @close="rejectDialog.open = false"
    >
      <div class="phase6-form-stack">
        <p class="phase6-muted">
          驳回 <strong>{{ rejectDialog.application?.username }}</strong> 的入驻申请，可填写驳回理由（选填），访客端查询时可看到。
        </p>
        <label class="phase6-field">
          <span>驳回备注</span>
          <textarea
            v-model="rejectDialog.reason"
            rows="3"
            maxlength="200"
            placeholder="例如：账号信息不完整，请补充后重新提交"
          />
          <small v-if="rejectDialog.error" class="phase6-field__error">
            {{ rejectDialog.error }}
          </small>
        </label>
      </div>
      <template #footer>
        <button
          type="button"
          class="phase6-button"
          @click="rejectDialog.open = false"
        >
          取消
        </button>
        <button
          type="button"
          class="phase6-button phase6-button--danger"
          :disabled="rejectDialog.busy"
          @click="rejectApplication"
        >
          {{ rejectDialog.busy ? '驳回中' : '确认驳回' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>

<style scoped>
.phase6-cell-wrap {
  max-width: 220px;
  white-space: normal;
  word-break: break-word;
}
.quota-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 14px;
  max-width: 480px;
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

.phase6-form-stack {
  display: grid;
  gap: 12px;
}

.phase6-action-cell {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.phase6-muted {
  color: rgba(244, 246, 245, 0.55);
  font-size: 13px;
}
</style>
