<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createM3Client, loginPhase5 } from './services/m3Client.js';

const tokenKey = 'virtual-utopia.phase5.token';
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const session = ref(null);
const api = ref(null);
const activeView = ref('overview');
const toast = ref('');
const busy = ref(false);
const loginForm = reactive({
  username: 'admin',
  password: 'utopia2026',
  error: '',
  busy: false,
});
const data = reactive({
  overview: null,
  worlds: [],
  homes: [],
  players: [],
  playerSummary: null,
  integrations: null,
  accounts: [],
  audit: [],
});
const forms = reactive({
  world: {
    id: 'world-main',
    name: '山林主世界',
    region: 'cn-east',
    capacity: 100,
  },
  home: {
    plotId: 'plot-51',
    worldId: 'world-main',
    ownerUserId: 1,
    ownerUsername: 'admin',
    visitMode: 'public',
  },
});
let pollTimer = null;
let toastTimer = null;

const notify = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2600);
};

const unauthorized = (error) =>
  error.status === 401 || error.code === 'BP4_UNAUTHORIZED';

const refresh = async () => {
  if (!api.value) {
    return;
  }

  try {
    const [overview, worlds, homes, players, integrations] = await Promise.all([
      api.value.overview(),
      api.value.worlds(),
      api.value.homes(),
      api.value.players(),
      api.value.integrations(),
    ]);

    data.overview = overview;
    data.worlds = worlds.worlds;
    data.homes = homes.homes;
    data.players = players.players;
    data.playerSummary = players.summary;
    data.integrations = integrations;
  } catch (error) {
    notify(error.message);
  }
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createM3Client({ token: token.value });

  try {
    const sessionPayload = await client.session();

    user.value = sessionPayload.user;
    session.value = sessionPayload;
    api.value = client;
    await refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 5000);
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
  clearInterval(pollTimer);
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
  session.value = null;
  api.value = null;
};

const runAction = async (action, message) => {
  busy.value = true;

  try {
    await action();
    await refresh();
    notify(message);
  } catch (error) {
    notify(error.message);
  } finally {
    busy.value = false;
  }
};

const createWorld = () =>
  runAction(
    () =>
      api.value.createWorld({
        ...forms.world,
        capacity: Number(forms.world.capacity) || 100,
      }),
    '世界实例已创建',
  );

const setWorldStatus = (world, status) =>
  runAction(
    () => api.value.updateWorld(world.id, { status }),
    '世界状态已更新',
  );

const createHome = () =>
  runAction(
    () =>
      api.value.createHome({
        ...forms.home,
        ownerUserId: Number(forms.home.ownerUserId),
      }),
    '家园实例已创建',
  );

const setHomeStatus = (home, status) =>
  runAction(
    () => api.value.updateHome(home.plotId, { status }),
    '家园状态已更新',
  );

const setRole = (userId, opsRole) =>
  runAction(() => api.value.setRole(userId, opsRole), '账号权限已更新');

const loadAdminData = async () => {
  if (!api.value) {
    return;
  }

  try {
    const [accounts, audit] = await Promise.all([
      api.value.accounts(),
      api.value.audit(),
    ]);

    data.accounts = accounts.accounts;
    data.audit = audit.events;
  } catch (error) {
    notify(error.message);
  }
};

const navItems = computed(() => [
  ['overview', '总览'],
  ['worlds', '世界实例'],
  ['homes', '家园实例'],
  ['players', '玩家状态'],
  ['accounts', '账号权限'],
  ['integrations', '集成监控'],
]);

onMounted(loadIdentity);
onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearTimeout(toastTimer);
});
</script>

<template>
  <main v-if="!user" class="m3-login">
    <section class="m3-login__panel">
      <span class="m3-kicker">BP4 OPERATIONS</span>
      <h1>世界运营后台</h1>
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
        <p v-if="loginForm.error" class="m3-error">
          {{ loginForm.error }}
        </p>
        <button type="submit" :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="m3-shell">
    <aside class="m3-sidebar">
      <div class="m3-brand">
        <span>虚拟乌托邦</span>
        <strong>OPERATIONS</strong>
      </div>
      <nav>
        <button
          v-for="[id, label] in navItems"
          :key="id"
          type="button"
          :class="{ 'is-active': activeView === id }"
          @click="
            activeView = id;
            (id === 'accounts' || id === 'integrations') && loadAdminData();
          "
        >
          {{ label }}
        </button>
      </nav>
      <div class="m3-account">
        <strong>{{ user.displayName }}</strong>
        <span>{{ session?.opsRole }}</span>
        <button type="button" @click="logout">退出</button>
      </div>
    </aside>

    <section class="m3-content">
      <header class="m3-topbar">
        <div>
          <span class="m3-kicker">WORLD OPERATIONS</span>
          <h1>{{ navItems.find(([id]) => id === activeView)?.[1] }}</h1>
        </div>
        <button type="button" @click="refresh">刷新</button>
      </header>

      <p v-if="toast" class="m3-toast">{{ toast }}</p>

      <section v-if="activeView === 'overview'" class="m3-grid">
        <article class="m3-metric">
          <span>世界实例</span>
          <strong>{{ data.overview?.worlds || 0 }}</strong>
        </article>
        <article class="m3-metric">
          <span>家园实例</span>
          <strong>{{ data.overview?.homes || 0 }}</strong>
        </article>
        <article class="m3-metric">
          <span>在线玩家</span>
          <strong>{{ data.overview?.players?.online || 0 }}</strong>
        </article>
        <article class="m3-metric">
          <span>M2指标</span>
          <strong>
            {{ data.overview?.integrations?.m2?.available ? '在线' : '离线' }}
          </strong>
        </article>
      </section>

      <section v-if="activeView === 'worlds'" class="m3-section">
        <form class="m3-inline-form" @submit.prevent="createWorld">
          <input v-model="forms.world.id" placeholder="world id" />
          <input v-model="forms.world.name" placeholder="名称" />
          <input v-model="forms.world.region" placeholder="区域" />
          <input
            v-model="forms.world.capacity"
            inputmode="numeric"
            placeholder="容量"
          />
          <button type="submit" :disabled="busy">创建世界</button>
        </form>
        <div class="m3-table">
          <div class="m3-table__head">
            <span>ID</span><span>名称</span><span>区域</span><span>状态</span
            ><span>操作</span>
          </div>
          <article v-for="world in data.worlds" :key="world.id">
            <span>{{ world.id }}</span>
            <span>{{ world.name }}</span>
            <span>{{ world.region }}</span>
            <span>{{ world.status }}</span>
            <span class="m3-row-actions">
              <button type="button" @click="setWorldStatus(world, 'online')">
                上线
              </button>
              <button
                type="button"
                @click="setWorldStatus(world, 'maintenance')"
              >
                维护
              </button>
              <button type="button" @click="setWorldStatus(world, 'offline')">
                下线
              </button>
            </span>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'homes'" class="m3-section">
        <form class="m3-inline-form" @submit.prevent="createHome">
          <input v-model="forms.home.plotId" placeholder="plot id" />
          <input v-model="forms.home.worldId" placeholder="world id" />
          <input v-model="forms.home.ownerUserId" placeholder="owner user id" />
          <input v-model="forms.home.ownerUsername" placeholder="owner name" />
          <button type="submit" :disabled="busy">创建家园</button>
        </form>
        <div class="m3-table">
          <div class="m3-table__head">
            <span>地块</span><span>世界</span><span>主人</span><span>状态</span
            ><span>访问</span><span>操作</span>
          </div>
          <article v-for="home in data.homes" :key="home.plotId">
            <span>{{ home.plotId }}</span>
            <span>{{ home.worldId }}</span>
            <span>{{ home.ownerUsername }}</span>
            <span>{{ home.status }}</span>
            <span>{{ home.visitMode }}</span>
            <span class="m3-row-actions">
              <button type="button" @click="setHomeStatus(home, 'active')">
                正常
              </button>
              <button type="button" @click="setHomeStatus(home, 'maintenance')">
                维护
              </button>
              <button type="button" @click="setHomeStatus(home, 'frozen')">
                冻结
              </button>
            </span>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'players'" class="m3-section">
        <div class="m3-grid">
          <article class="m3-metric">
            <span>已记录玩家</span>
            <strong>{{ data.playerSummary?.total || 0 }}</strong>
          </article>
          <article class="m3-metric">
            <span>在线</span>
            <strong>{{ data.playerSummary?.online || 0 }}</strong>
          </article>
          <article class="m3-metric">
            <span>发言中</span>
            <strong>{{ data.playerSummary?.speaking || 0 }}</strong>
          </article>
        </div>
        <div class="m3-table">
          <div class="m3-table__head">
            <span>用户</span><span>世界</span><span>动作</span><span>语音</span
            ><span>状态</span><span>最后事件</span>
          </div>
          <article v-for="player in data.players" :key="player.userId">
            <span>{{
              player.displayName || player.username || player.userId
            }}</span>
            <span>{{ player.worldId }}</span>
            <span>{{ player.actionId || 'idle' }}</span>
            <span>{{
              player.speaking ? '发言' : player.muted ? '静音' : '在线'
            }}</span>
            <span>{{ player.status }}</span>
            <span>{{
              new Date(player.lastSeenAt).toLocaleString('zh-CN')
            }}</span>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'accounts'" class="m3-section">
        <button type="button" @click="loadAdminData">加载账号</button>
        <div class="m3-table">
          <div class="m3-table__head">
            <span>用户 ID</span><span>账号</span><span>Phase5角色</span
            ><span>运营角色</span><span>操作</span>
          </div>
          <article v-for="account in data.accounts" :key="account.userId">
            <span>{{ account.userId }}</span>
            <span>{{ account.username || '--' }}</span>
            <span>{{ account.phase5Role || '--' }}</span>
            <span>{{ account.opsRole }}</span>
            <span class="m3-row-actions">
              <button type="button" @click="setRole(account.userId, 'viewer')">
                viewer
              </button>
              <button
                type="button"
                @click="setRole(account.userId, 'operator')"
              >
                operator
              </button>
              <button type="button" @click="setRole(account.userId, 'admin')">
                admin
              </button>
            </span>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'integrations'" class="m3-section">
        <div class="m3-grid">
          <article class="m3-metric">
            <span>M1实时通道</span>
            <strong>{{
              data.integrations?.m1?.connected ? '已连接' : '未连接'
            }}</strong>
          </article>
          <article class="m3-metric">
            <span>M2监控</span>
            <strong>{{
              data.integrations?.m2?.available ? '正常' : '不可用'
            }}</strong>
          </article>
        </div>
        <pre>{{ JSON.stringify(data.integrations, null, 2) }}</pre>
        <div class="m3-table">
          <div class="m3-table__head">
            <span>时间</span><span>动作</span><span>资源</span><span>结果</span>
          </div>
          <article v-for="event in data.audit.slice(0, 20)" :key="event.id">
            <span>{{ new Date(event.createdAt).toLocaleString('zh-CN') }}</span>
            <span>{{ event.action }}</span>
            <span
              >{{ event.resourceType }} / {{ event.resourceId || '--' }}</span
            >
            <span>{{ event.result }}</span>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>
