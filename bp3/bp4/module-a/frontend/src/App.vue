<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createModuleAClient, loginPhase5 } from './services/moduleAClient.js';
import { createModuleARealtimeClient } from './services/realtimeClient.js';

const tokenKey = 'virtual-utopia.phase5.token';
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const session = ref(null);
const api = ref(null);
const homes = ref([]);
const users = ref([]);
const summary = ref(null);
const selectedPlotId = ref('plot-1');
const realtimeStatus = ref('offline');
const realtimeEvents = ref([]);
const evaluation = ref(null);
const toast = ref('');
const busy = ref(false);
const loginForm = reactive({
  username: 'admin',
  password: 'utopia2026',
  error: '',
  busy: false,
});
const accessForm = reactive({
  ownerUserId: '',
  ownerUsername: '',
  accessMode: 'private',
  friendUserIds: '',
});
const testForm = reactive({
  targetUserId: '3',
  action: 'view',
});
let realtimeClient = null;
let toastTimer = null;

const selectedHome = computed(() =>
  homes.value.find((home) => home.plotId === selectedPlotId.value),
);
const canManage = computed(() => session.value?.opsRole !== 'viewer');
const modeLabels = {
  private: '私有',
  friends: '好友可见',
  public: '公开',
};

const notify = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2600);
};

const unauthorized = (error) =>
  error.status === 401 || error.code === 'BP4_UNAUTHORIZED';

const parseFriendIds = () =>
  accessForm.friendUserIds
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

const loadHome = async (plotId = selectedPlotId.value) => {
  const payload = await api.value.access(plotId);

  selectedPlotId.value = plotId;
  accessForm.ownerUserId = payload.home.ownerUserId || '';
  accessForm.ownerUsername = payload.home.ownerUsername || '';
  accessForm.accessMode = payload.home.accessMode;
  accessForm.friendUserIds = payload.home.friendUserIds.join(', ');
};

const refresh = async () => {
  if (!api.value) {
    return;
  }

  const [homePayload, userPayload, eventPayload] = await Promise.all([
    api.value.homes(),
    api.value.users(),
    api.value.events(selectedPlotId.value),
  ]);

  homes.value = homePayload.homes;
  summary.value = homePayload.summary;
  users.value = userPayload.users;
  realtimeEvents.value = eventPayload.events;

  if (!homes.value.some((home) => home.plotId === selectedPlotId.value)) {
    selectedPlotId.value = homes.value[0]?.plotId || '';
  }

  if (selectedPlotId.value) {
    await loadHome(selectedPlotId.value);
  }
};

const connectRealtime = async () => {
  realtimeClient?.stop();
  realtimeStatus.value = 'connecting';
  const ticket = await api.value.realtimeTicket();

  realtimeClient = createModuleARealtimeClient({
    ticket: ticket.ticket,
    onReady: () => {
      realtimeStatus.value = 'online';
    },
    onError: () => {
      realtimeStatus.value = 'offline';
    },
    onEvent: (event) => {
      const data = event.data || {};

      if (
        data.kind === 'home.access.updated' ||
        data.kind === 'home.ownership.updated'
      ) {
        realtimeEvents.value = [
          {
            id: event.sequence,
            eventType: data.kind,
            plotId: data.plotId,
            payload: data,
            version: data.version,
            createdAt: event.sentAt,
          },
          ...realtimeEvents.value,
        ].slice(0, 100);
        refresh().catch(() => null);
      }
    },
  });
  realtimeClient.start();
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createModuleAClient({ token: token.value });

  try {
    const sessionPayload = await client.session();

    user.value = sessionPayload.user;
    session.value = sessionPayload;
    api.value = client;
    await refresh();
    await connectRealtime();
  } catch (error) {
    if (unauthorized(error)) {
      token.value = '';
      sessionStorage.removeItem(tokenKey);
    }
    loginForm.error = error.message;
  }
};

const login = async () => {
  loginForm.busy = true;
  loginForm.error = '';

  try {
    const result = await loginPhase5({
      username: loginForm.username.trim(),
      password: loginForm.password,
    });

    token.value = result.token;
    sessionStorage.setItem(tokenKey, result.token);
    await loadIdentity();
  } catch (error) {
    loginForm.error = error.message;
  } finally {
    loginForm.busy = false;
  }
};

const logout = () => {
  realtimeClient?.stop();
  realtimeClient = null;
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
  session.value = null;
  api.value = null;
  homes.value = [];
  summary.value = null;
  realtimeStatus.value = 'offline';
};

const runAction = async (action, message) => {
  busy.value = true;

  try {
    const result = await action();

    await refresh();
    notify(message);
    return result;
  } catch (error) {
    notify(error.message);
    return null;
  } finally {
    busy.value = false;
  }
};

const saveOwner = () =>
  runAction(
    () =>
      api.value.updateOwner(selectedPlotId.value, {
        ownerUserId: Number(accessForm.ownerUserId),
        ownerUsername: accessForm.ownerUsername,
      }),
    '房主绑定已更新',
  );

const saveAccess = () =>
  runAction(
    () =>
      api.value.updateAccess(selectedPlotId.value, {
        accessMode: accessForm.accessMode,
        friendUserIds: parseFriendIds(),
      }),
    '家园访问权限已更新',
  );

const runEvaluation = async () => {
  try {
    evaluation.value = await api.value.evaluate(selectedPlotId.value, {
      targetUserId: Number(testForm.targetUserId),
      action: testForm.action,
    });
  } catch (error) {
    notify(error.message);
  }
};

onMounted(loadIdentity);
onBeforeUnmount(() => {
  realtimeClient?.stop();
  clearTimeout(toastTimer);
});
</script>

<template>
  <main v-if="!user" class="ma-login">
    <section class="ma-login__panel">
      <span class="ma-kicker">BP4 MODULE A</span>
      <h1>家园权限管理</h1>
      <p>M3运营后台扩展面板</p>
      <form @submit.prevent="login">
        <label>
          <span>用户名</span>
          <input v-model="loginForm.username" autocomplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="loginForm.password"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <p v-if="loginForm.error" class="ma-error">
          {{ loginForm.error }}
        </p>
        <button type="submit" :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="ma-shell">
    <header class="ma-header">
      <div>
        <span class="ma-kicker">M3 HOME ACCESS</span>
        <h1>家园权限管理</h1>
      </div>
      <div class="ma-session">
        <span :class="`is-${realtimeStatus}`">
          {{ realtimeStatus === 'online' ? '实时同步' : '连接中' }}
        </span>
        <strong>{{ user.displayName }}</strong>
        <span>{{ session?.opsRole }}</span>
        <button type="button" @click="logout">退出</button>
      </div>
    </header>

    <section class="ma-metrics">
      <article>
        <span>家园总数</span>
        <strong>{{ summary?.total || 0 }}</strong>
      </article>
      <article>
        <span>未绑定</span>
        <strong>{{ summary?.unassigned || 0 }}</strong>
      </article>
      <article>
        <span>私有</span>
        <strong>{{ summary?.private || 0 }}</strong>
      </article>
      <article>
        <span>好友可见</span>
        <strong>{{ summary?.friends || 0 }}</strong>
      </article>
      <article>
        <span>公开</span>
        <strong>{{ summary?.public || 0 }}</strong>
      </article>
    </section>

    <section class="ma-layout">
      <aside class="ma-homes">
        <header>
          <div>
            <span class="ma-kicker">50 HOME PLOTS</span>
            <h2>家园归属</h2>
          </div>
          <button type="button" @click="refresh">刷新</button>
        </header>
        <div class="ma-home-list">
          <button
            v-for="home in homes"
            :key="home.plotId"
            type="button"
            :class="{
              'is-active': home.plotId === selectedPlotId,
            }"
            @click="loadHome(home.plotId)"
          >
            <strong>{{ home.plotId }}</strong>
            <span>
              {{ home.ownerUsername || '未绑定' }}
            </span>
            <em>{{ modeLabels[home.accessMode] }}</em>
          </button>
        </div>
      </aside>

      <section class="ma-editor">
        <header>
          <div>
            <span class="ma-kicker">ACCESS CONTROL</span>
            <h2>{{ selectedPlotId }}</h2>
          </div>
          <span class="ma-version"> v{{ selectedHome?.version || 0 }} </span>
        </header>

        <div class="ma-section">
          <h3>房主绑定</h3>
          <div class="ma-form-row">
            <label>
              <span>玩家ID</span>
              <input
                v-model="accessForm.ownerUserId"
                :disabled="!canManage"
                inputmode="numeric"
              />
            </label>
            <label>
              <span>玩家名称</span>
              <input
                v-model="accessForm.ownerUsername"
                :disabled="!canManage"
              />
            </label>
            <button
              type="button"
              :disabled="!canManage || busy"
              @click="saveOwner"
            >
              绑定房主
            </button>
          </div>
        </div>

        <div class="ma-section">
          <h3>访问权限</h3>
          <div class="ma-modes">
            <button
              v-for="mode in ['private', 'friends', 'public']"
              :key="mode"
              type="button"
              :class="{ 'is-active': accessForm.accessMode === mode }"
              :disabled="!canManage"
              @click="accessForm.accessMode = mode"
            >
              {{ modeLabels[mode] }}
            </button>
          </div>
          <label class="ma-friend-input">
            <span>好友玩家ID</span>
            <input
              v-model="accessForm.friendUserIds"
              :disabled="!canManage || accessForm.accessMode !== 'friends'"
              placeholder="例如 4, 7, 12"
            />
          </label>
          <button
            type="button"
            class="ma-primary"
            :disabled="!canManage || busy"
            @click="saveAccess"
          >
            保存权限
          </button>
        </div>

        <div class="ma-section">
          <h3>权限校验</h3>
          <div class="ma-form-row">
            <label>
              <span>玩家ID</span>
              <input v-model="testForm.targetUserId" inputmode="numeric" />
            </label>
            <label>
              <span>动作</span>
              <select v-model="testForm.action">
                <option value="view">查看家园</option>
                <option value="edit">编辑家园</option>
              </select>
            </label>
            <button type="button" :disabled="!canManage" @click="runEvaluation">
              执行校验
            </button>
          </div>
          <div
            v-if="evaluation"
            class="ma-evaluation"
            :class="{ 'is-allowed': evaluation.allowed }"
          >
            <strong>
              {{ evaluation.allowed ? '允许' : '拒绝' }}
            </strong>
            <span>{{ evaluation.reason }}</span>
          </div>
        </div>
      </section>

      <aside class="ma-events">
        <header>
          <span class="ma-kicker">REALTIME EVENTS</span>
          <h2>权限变更通知</h2>
        </header>
        <ul>
          <li
            v-for="event in realtimeEvents.slice(0, 12)"
            :key="`${event.id}-${event.plotId}`"
          >
            <strong>{{ event.plotId }}</strong>
            <span>{{ event.eventType }}</span>
            <em>v{{ event.version }}</em>
          </li>
          <li v-if="!realtimeEvents.length">等待权限变更</li>
        </ul>
      </aside>
    </section>

    <p v-if="toast" class="ma-toast">{{ toast }}</p>

    <span
      class="ma-observability"
      :data-home-count="homes.length"
      :data-selected-plot="selectedPlotId"
      :data-access-mode="accessForm.accessMode"
      :data-realtime-status="realtimeStatus"
      :data-ops-role="session?.opsRole"
    />
  </main>
</template>
