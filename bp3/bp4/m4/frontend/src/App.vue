<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createM4Client, loginPhase5 } from './services/m4Client.js';

const tokenKey = 'virtual-utopia.phase5.token';
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const activeView = ref('dashboard');
const toast = ref('');
const busy = ref(false);
const online = ref(navigator.onLine);
const loginForm = reactive({
  username: 'admin',
  password: 'utopia2026',
  busy: false,
  error: '',
});
const templateFilter = ref('');
const templates = ref([]);
const dashboard = ref(null);
const audit = ref([]);
const form = reactive({
  id: 'home-cabin-basic',
  templateType: 'home',
  name: '林间基础家园',
  description: '标准木构家园布局模板',
  version: '1.0.0',
  payloadText: '{"style":"forest"}',
});
let timer = null;

const notify = (message) => {
  toast.value = message;
  setTimeout(() => {
    toast.value = '';
  }, 2500);
};

const refresh = async () => {
  if (!api.value) {
    return;
  }

  try {
    const [dashboardPayload, templatePayload, auditPayload] = await Promise.all(
      [
        api.value.dashboard(),
        api.value.templates(templateFilter.value),
        user.value?.role === 'admin'
          ? api.value.audit()
          : Promise.resolve({ events: [] }),
      ],
    );

    dashboard.value = dashboardPayload;
    templates.value = templatePayload.templates;
    audit.value = auditPayload.events;
  } catch (error) {
    notify(error.message);
  }
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createM4Client({ token: token.value });

  try {
    const session = await client.session();

    user.value = session.user;
    api.value = client;
    await refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 5000);
  } catch (error) {
    token.value = '';
    sessionStorage.removeItem(tokenKey);
    loginForm.error = error.message;
  }
};

const login = async () => {
  loginForm.busy = true;
  loginForm.error = '';

  try {
    const session = await loginPhase5({
      username: loginForm.username.trim(),
      password: loginForm.password,
    });

    token.value = session.token;
    sessionStorage.setItem(tokenKey, session.token);
    await loadIdentity();
  } catch (error) {
    loginForm.error = error.message;
  } finally {
    loginForm.busy = false;
  }
};

const logout = () => {
  clearInterval(timer);
  sessionStorage.removeItem(tokenKey);
  token.value = '';
  user.value = null;
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

const createTemplate = () => {
  let payload;

  try {
    payload = JSON.parse(form.payloadText);
  } catch {
    notify('模板JSON格式错误');
    return;
  }

  return runAction(
    () =>
      api.value.createTemplate({
        ...form,
        payload,
      }),
    '内容模板已创建',
  );
};

const publishTemplate = (template) =>
  runAction(() => api.value.publishTemplate(template.id), '模板已发布');

const archiveTemplate = (template) =>
  runAction(
    () =>
      api.value.updateTemplate(template.id, {
        status: 'archived',
      }),
    '模板已归档',
  );

const filteredTemplates = computed(() =>
  templateFilter.value
    ? templates.value.filter(
        (template) => template.templateType === templateFilter.value,
      )
    : templates.value,
);

const templateStats = computed(() => {
  const base = {
    home: 0,
    scene: 0,
    published: 0,
  };

  templates.value.forEach((template) => {
    base[template.templateType] += 1;
    if (template.status === 'published') {
      base.published += 1;
    }
  });

  return base;
});

const updateNetworkState = () => {
  online.value = navigator.onLine;
};

onMounted(() => {
  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);
  void loadIdentity();
});

onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('online', updateNetworkState);
  window.removeEventListener('offline', updateNetworkState);
});
</script>

<template>
  <main v-if="!user" class="m4-login">
    <section class="m4-login__panel">
      <span class="m4-kicker">BP4 CONTENT · PWA · DATA</span>
      <h1>内容与数据看板</h1>
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
        <p v-if="loginForm.error" class="m4-error">
          {{ loginForm.error }}
        </p>
        <button type="submit" :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="m4-shell">
    <aside class="m4-sidebar">
      <div class="m4-brand">
        <strong>虚拟乌托邦</strong>
        <span>BP4 CONTENT</span>
      </div>
      <nav>
        <button
          type="button"
          :class="{ 'is-active': activeView === 'dashboard' }"
          @click="activeView = 'dashboard'"
        >
          数据看板
        </button>
        <button
          type="button"
          :class="{ 'is-active': activeView === 'templates' }"
          @click="activeView = 'templates'"
        >
          内容模板
        </button>
        <button
          type="button"
          :class="{ 'is-active': activeView === 'audit' }"
          @click="activeView = 'audit'"
        >
          操作审计
        </button>
      </nav>
      <div class="m4-account">
        <strong>{{ user.displayName }}</strong>
        <span>{{ user.role }}</span>
        <button type="button" @click="logout">退出</button>
      </div>
    </aside>

    <section class="m4-content">
      <header class="m4-topbar">
        <div>
          <span class="m4-kicker">CONTENT OPERATIONS</span>
          <h1>
            {{
              activeView === 'dashboard'
                ? '数据看板'
                : activeView === 'templates'
                  ? '内容模板'
                  : '操作审计'
            }}
          </h1>
        </div>
        <div class="m4-network" :class="{ 'is-offline': !online }">
          {{ online ? '在线' : '离线缓存模式' }}
        </div>
      </header>

      <p v-if="toast" class="m4-toast">{{ toast }}</p>

      <section v-if="activeView === 'dashboard'" class="m4-grid">
        <article class="m4-metric">
          <span>家园模板</span>
          <strong>{{ templateStats.home }}</strong>
        </article>
        <article class="m4-metric">
          <span>场景模板</span>
          <strong>{{ templateStats.scene }}</strong>
        </article>
        <article class="m4-metric">
          <span>已发布</span>
          <strong>{{ templateStats.published }}</strong>
        </article>
        <article class="m4-metric">
          <span>M1实时服务</span>
          <strong>{{
            dashboard?.metrics?.m1?.available ? '正常' : '离线'
          }}</strong>
        </article>
        <article class="m4-metric">
          <span>M2集群</span>
          <strong>{{
            dashboard?.metrics?.m2?.available ? '正常' : '离线'
          }}</strong>
        </article>
      </section>

      <section v-if="activeView === 'templates'" class="m4-section">
        <div class="m4-filter">
          <button
            type="button"
            :class="{ 'is-active': !templateFilter }"
            @click="templateFilter = ''"
          >
            全部
          </button>
          <button
            type="button"
            :class="{ 'is-active': templateFilter === 'home' }"
            @click="templateFilter = 'home'"
          >
            家园
          </button>
          <button
            type="button"
            :class="{ 'is-active': templateFilter === 'scene' }"
            @click="templateFilter = 'scene'"
          >
            场景
          </button>
        </div>

        <form class="m4-form" @submit.prevent="createTemplate">
          <input v-model="form.id" placeholder="模板ID" />
          <select v-model="form.templateType">
            <option value="home">家园模板</option>
            <option value="scene">场景模板</option>
          </select>
          <input v-model="form.name" placeholder="模板名称" />
          <input v-model="form.description" placeholder="说明" />
          <input v-model="form.version" placeholder="版本" />
          <textarea
            v-model="form.payloadText"
            rows="3"
            placeholder="模板JSON"
          />
          <button type="submit" :disabled="busy">创建模板</button>
        </form>

        <div class="m4-table">
          <div class="m4-table__head">
            <span>类型</span><span>名称</span><span>版本</span><span>状态</span
            ><span>更新时间</span><span>操作</span>
          </div>
          <article v-for="template in filteredTemplates" :key="template.id">
            <span>{{ template.templateType }}</span>
            <span>{{ template.name }}</span>
            <span>{{ template.version }}</span>
            <span>{{ template.status }}</span>
            <span>{{
              new Date(template.updatedAt).toLocaleString('zh-CN')
            }}</span>
            <span class="m4-actions">
              <button type="button" @click="publishTemplate(template)">
                发布
              </button>
              <button type="button" @click="archiveTemplate(template)">
                归档
              </button>
            </span>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'audit'" class="m4-section">
        <div class="m4-table">
          <div class="m4-table__head">
            <span>时间</span><span>动作</span><span>模板</span><span>结果</span>
          </div>
          <article v-for="event in audit" :key="event.id">
            <span>{{ new Date(event.createdAt).toLocaleString('zh-CN') }}</span>
            <span>{{ event.action }}</span>
            <span>{{ event.templateId || '--' }}</span>
            <span>{{ event.result }}</span>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>
