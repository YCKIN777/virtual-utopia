<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';

const props = defineProps({
  api: {
    type: Object,
    required: true,
  },
  user: {
    type: Object,
    required: true,
  },
  plotId: {
    type: String,
    default: '',
  },
});

const state = reactive({
  loading: false,
  error: '',
  canManage: false,
  rule: null,
  visitors: [],
  requests: [],
  invites: [],
  logs: [],
});
const targetUserId = ref('');
const listType = ref('whitelist');
const inviteUses = ref(1);
const inviteHours = ref(24);
const createdInvite = ref('');

const isOwner = computed(() => state.canManage);

const load = async () => {
  if (!props.plotId) {
    return;
  }

  state.loading = true;
  state.error = '';

  try {
    const access = await props.api.getHomeAccess(props.plotId);

    state.rule = access.rule;
    state.canManage = access.currentUser?.canManage === true;
    state.visitors = access.visitors || [];
    state.requests = access.requests || [];
    state.invites = (access.grants || []).filter(
      (grant) => grant.grantType === 'temporary_invite',
    );
    state.logs = isOwner.value
      ? (await props.api.listHomeLogs(props.plotId, 40)).logs
      : [];
  } catch (error) {
    state.error = error.message || '家园权限加载失败';
  } finally {
    state.loading = false;
  }
};

const setAccessMode = async (accessMode) => {
  state.loading = true;
  state.error = '';

  try {
    const payload = await props.api.updateHomeAccess(props.plotId, {
      accessMode,
    });

    state.rule = payload.rule;
  } catch (error) {
    state.error = error.message || '访问状态保存失败';
  } finally {
    state.loading = false;
  }
};

const setLock = async (locked) => {
  state.loading = true;
  state.error = '';

  try {
    const payload = await props.api.setDoorLock(props.plotId, locked);

    state.rule = payload.rule;
  } catch (error) {
    state.error = error.message || '门锁状态保存失败';
  } finally {
    state.loading = false;
  }
};

const addVisitor = async () => {
  const userId = Number(targetUserId.value);

  if (!Number.isInteger(userId) || userId <= 0) {
    state.error = '请输入有效用户 ID';
    return;
  }

  state.loading = true;
  state.error = '';

  try {
    await props.api.setVisitor(props.plotId, {
      userId,
      listType: listType.value,
    });
    targetUserId.value = '';
    await load();
  } catch (error) {
    state.error = error.message || '访客列表保存失败';
  } finally {
    state.loading = false;
  }
};

const removeVisitor = async (visitor) => {
  state.loading = true;

  try {
    await props.api.removeVisitor(props.plotId, visitor.userId);
    await load();
  } catch (error) {
    state.error = error.message || '撤销访问失败';
  } finally {
    state.loading = false;
  }
};

const resolveRequest = async (request, action) => {
  state.loading = true;

  try {
    if (action === 'approve') {
      await props.api.approveAccessRequest(props.plotId, request.id);
    } else {
      await props.api.rejectAccessRequest(props.plotId, request.id);
    }

    await load();
  } catch (error) {
    state.error = error.message || '申请处理失败';
  } finally {
    state.loading = false;
  }
};

const createInvite = async () => {
  state.loading = true;
  state.error = '';

  try {
    const payload = await props.api.createInvite(props.plotId, {
      expiresInSeconds: Math.max(Number(inviteHours.value) || 1, 1) * 3600,
      maxUses: Math.max(Number(inviteUses.value) || 1, 1),
    });

    createdInvite.value = payload.token;
    await load();
  } catch (error) {
    state.error = error.message || '临时邀请创建失败';
  } finally {
    state.loading = false;
  }
};

const revokeInvite = async (invite) => {
  state.loading = true;

  try {
    await props.api.revokeGrant(props.plotId, invite.id);
    await load();
  } catch (error) {
    state.error = error.message || '邀请撤销失败';
  } finally {
    state.loading = false;
  }
};

const copyInvite = async () => {
  if (createdInvite.value) {
    await navigator.clipboard.writeText(createdInvite.value).catch(() => null);
  }
};

watch(
  () => props.plotId,
  () => {
    void load();
  },
);
onMounted(load);
</script>

<template>
  <section class="bp3-panel bp3-home-panel">
    <header class="bp3-panel__header">
      <div>
        <span class="bp3-kicker">HOME ACCESS</span>
        <h2>家园权限与门锁</h2>
      </div>
      <div class="bp3-inline-actions">
        <span class="bp3-plot">{{ plotId || '--' }}</span>
        <button
          type="button"
          class="bp3-button"
          :disabled="state.loading"
          @click="load"
        >
          刷新
        </button>
      </div>
    </header>

    <p v-if="state.error" class="bp3-error">
      {{ state.error }}
    </p>

    <template v-if="state.rule">
      <div class="bp3-field-group">
        <span class="bp3-label">访问状态</span>
        <div class="bp3-segmented">
          <button
            v-for="mode in [
              ['public', '公开'],
              ['private', '私密'],
              ['request', '申请'],
              ['whitelist', '白名单'],
            ]"
            :key="mode[0]"
            type="button"
            :class="{
              'is-active': state.rule.accessMode === mode[0],
            }"
            :disabled="state.loading || !isOwner"
            @click="setAccessMode(mode[0])"
          >
            {{ mode[1] }}
          </button>
        </div>
      </div>

      <div class="bp3-lock-row">
        <div>
          <span class="bp3-label">门锁</span>
          <strong>
            {{ state.rule.lockEnabled ? '已上锁' : '已开放' }}
          </strong>
        </div>
        <button
          type="button"
          class="bp3-button"
          :disabled="state.loading || !isOwner"
          @click="setLock(!state.rule.lockEnabled)"
        >
          {{ state.rule.lockEnabled ? '开门' : '上锁' }}
        </button>
      </div>

      <div v-if="isOwner" class="bp3-subsection">
        <span class="bp3-label">访客名单</span>
        <div class="bp3-inline-form">
          <input
            v-model="targetUserId"
            inputmode="numeric"
            placeholder="用户 ID"
          />
          <select v-model="listType">
            <option value="whitelist">白名单</option>
            <option value="blacklist">黑名单</option>
          </select>
          <button
            type="button"
            class="bp3-button"
            :disabled="state.loading"
            @click="addVisitor"
          >
            保存
          </button>
        </div>
        <ul class="bp3-compact-list">
          <li
            v-for="visitor in state.visitors"
            :key="`${visitor.userId}-${visitor.listType}`"
          >
            <span>用户 {{ visitor.userId }}</span>
            <span
              class="bp3-tag"
              :class="{
                'is-danger': visitor.listType === 'blacklist',
              }"
            >
              {{ visitor.listType === 'blacklist' ? '黑名单' : '白名单' }}
            </span>
            <button type="button" @click="removeVisitor(visitor)">撤销</button>
          </li>
        </ul>
      </div>

      <div v-if="isOwner" class="bp3-subsection">
        <span class="bp3-label">访客申请</span>
        <ul class="bp3-request-list">
          <li
            v-for="request in state.requests.filter(
              (item) => item.status === 'pending',
            )"
            :key="request.id"
          >
            <div>
              <strong>
                {{ request.requesterDisplayName }}
              </strong>
              <span>
                {{ request.message || '请求访问家园' }}
              </span>
            </div>
            <div class="bp3-inline-actions">
              <button type="button" @click="resolveRequest(request, 'approve')">
                同意
              </button>
              <button type="button" @click="resolveRequest(request, 'reject')">
                拒绝
              </button>
            </div>
          </li>
          <li
            v-if="!state.requests.some((item) => item.status === 'pending')"
            class="bp3-empty"
          >
            暂无待处理申请
          </li>
        </ul>
      </div>

      <div v-if="isOwner" class="bp3-subsection">
        <span class="bp3-label">临时邀请</span>
        <div class="bp3-inline-form">
          <input
            v-model="inviteHours"
            inputmode="numeric"
            aria-label="有效小时"
          />
          <input
            v-model="inviteUses"
            inputmode="numeric"
            aria-label="可使用次数"
          />
          <button
            type="button"
            class="bp3-button"
            :disabled="state.loading"
            @click="createInvite"
          >
            生成
          </button>
        </div>
        <div v-if="createdInvite" class="bp3-token-row">
          <code>{{ createdInvite }}</code>
          <button type="button" @click="copyInvite">复制</button>
        </div>
        <ul class="bp3-compact-list">
          <li
            v-for="invite in state.invites.filter(
              (item) => !item.revokedAt && item.usedCount < item.maxUses,
            )"
            :key="invite.id"
          >
            <span> {{ invite.usedCount }}/{{ invite.maxUses }} </span>
            <span>
              {{
                invite.expiresAt
                  ? new Date(invite.expiresAt).toLocaleString('zh-CN')
                  : '长期'
              }}
            </span>
            <button type="button" @click="revokeInvite(invite)">撤销</button>
          </li>
        </ul>
      </div>

      <div v-if="isOwner" class="bp3-subsection">
        <span class="bp3-label">最近访问</span>
        <ul class="bp3-log-list">
          <li v-for="log in state.logs.slice(0, 5)" :key="log.id">
            <span>{{ log.username }}</span>
            <span>{{ log.action }}</span>
            <span>{{ log.result }}</span>
          </li>
        </ul>
      </div>
    </template>

    <p v-else-if="!state.loading" class="bp3-empty">暂无访问规则</p>
  </section>
</template>
