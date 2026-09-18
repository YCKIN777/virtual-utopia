<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createModuleBClient, loginPhase5 } from './services/moduleBClient.js';
import { createModuleBRealtimeClient } from './services/realtimeClient.js';

const tokenKey = 'virtual-utopia.phase5.token';
const token = ref(sessionStorage.getItem(tokenKey) || '');
const user = ref(null);
const api = ref(null);
const messages = ref([]);
const channelType = ref('world');
const plotId = ref('plot-1');
const targetUserId = ref('2');
const messageText = ref('');
const realtimeStatus = ref('offline');
const toast = ref('');
const busy = ref(false);
const loginForm = reactive({
  username: 'admin',
  password: 'utopia2026',
  error: '',
  busy: false,
});
let realtimeClient = null;
let toastTimer = null;

const channel = computed(() => {
  if (channelType.value === 'home') {
    return {
      type: 'home',
      plotId: plotId.value,
    };
  }

  if (channelType.value === 'direct') {
    return {
      type: 'direct',
      targetUserId: Number(targetUserId.value),
    };
  }

  return {
    type: 'world',
  };
});
const activeChannelId = computed(() => {
  if (channelType.value === 'home') {
    return `home-${plotId.value}`;
  }

  if (channelType.value === 'direct') {
    const first = Number(user.value?.id) || 0;
    const second = Number(targetUserId.value) || 0;
    const lower = Math.min(first, second);
    const upper = Math.max(first, second);

    return `dm-${lower}-${upper}`;
  }

  return 'world-main';
});
const channelLabel = computed(() => {
  if (channelType.value === 'home') {
    return `家园 ${plotId.value}`;
  }

  if (channelType.value === 'direct') {
    return `私聊 ${targetUserId.value}`;
  }

  return '世界公屏';
});

const notify = (message) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2600);
};

const unauthorized = (error) =>
  error.status === 401 || error.code === 'BP4_UNAUTHORIZED';

const loadHistory = async () => {
  if (!api.value) {
    return;
  }

  const payload = await api.value.history(channel.value);

  messages.value = payload.messages;
};

const connectRealtime = async () => {
  realtimeClient?.stop();
  realtimeStatus.value = 'connecting';
  const ticket = await api.value.realtimeTicket();

  realtimeClient = createModuleBRealtimeClient({
    ticket: ticket.ticket,
    onReady: () => {
      realtimeStatus.value = 'online';
      realtimeClient.subscribe(channel.value);
    },
    onError: () => {
      realtimeStatus.value = 'offline';
    },
    onEvent: (event) => {
      if (event.type === 'chat.message.created') {
        if (event.channel === activeChannelId.value) {
          messages.value = [
            ...messages.value.filter((message) => message.id !== event.data.id),
            event.data,
          ];
        }
      }

      if (
        event.type === 'event.updated' &&
        event.data?.kind === 'chat.message.recalled'
      ) {
        messages.value = messages.value.map((message) =>
          message.id === event.data.id
            ? {
                ...message,
                content: '[消息已撤回]',
                status: 'recalled',
              }
            : message,
        );
      }

      if (event.type === 'error') {
        notify(event.message || '聊天操作失败');
      }
    },
  });
  realtimeClient.start();
};

const loadIdentity = async () => {
  if (!token.value) {
    return;
  }

  const client = createModuleBClient({ token: token.value });

  try {
    const session = await client.session();

    user.value = session.user;
    api.value = client;
    await loadHistory();
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
  api.value = null;
  messages.value = [];
  realtimeStatus.value = 'offline';
};

const switchChannel = async () => {
  await loadHistory();
  realtimeClient?.subscribe(channel.value);
};

const sendMessage = async () => {
  const content = messageText.value.trim();

  if (!content || !realtimeClient) {
    return;
  }

  busy.value = true;
  try {
    const sent = realtimeClient.sendMessage(channel.value, content);

    if (!sent) {
      throw new Error('实时通道未连接');
    }
    messageText.value = '';
  } catch (error) {
    notify(error.message);
  } finally {
    busy.value = false;
  }
};

const recallMessage = async (message) => {
  if (!realtimeClient?.recall(message.id)) {
    notify('实时通道未连接');
  }
};

onMounted(loadIdentity);
onBeforeUnmount(() => {
  realtimeClient?.stop();
  clearTimeout(toastTimer);
});
</script>

<template>
  <main v-if="!user" class="mb-login">
    <section class="mb-login__panel">
      <span class="mb-kicker">BP4 MODULE B</span>
      <h1>社交聊天调试面板</h1>
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
        <p v-if="loginForm.error" class="mb-error">
          {{ loginForm.error }}
        </p>
        <button type="submit" :disabled="loginForm.busy">
          {{ loginForm.busy ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>

  <main v-else class="mb-shell">
    <header class="mb-header">
      <div>
        <span class="mb-kicker">M1 REALTIME CHAT</span>
        <h1>社交聊天调试面板</h1>
      </div>
      <div class="mb-session">
        <span :class="`is-${realtimeStatus}`">
          {{ realtimeStatus === 'online' ? '实时在线' : '连接中' }}
        </span>
        <strong>{{ user.displayName }}</strong>
        <button type="button" @click="logout">退出</button>
      </div>
    </header>

    <section class="mb-layout">
      <aside class="mb-channels">
        <span class="mb-kicker">CHANNELS</span>
        <h2>聊天频道</h2>
        <button
          v-for="item in [
            ['world', '世界公屏'],
            ['home', '家园频道'],
            ['direct', '玩家私聊'],
          ]"
          :key="item[0]"
          type="button"
          :class="{ 'is-active': channelType === item[0] }"
          @click="
            channelType = item[0];
            switchChannel();
          "
        >
          {{ item[1] }}
        </button>

        <label v-if="channelType === 'home'">
          <span>家园地块</span>
          <input v-model="plotId" @change="switchChannel" />
        </label>
        <label v-if="channelType === 'direct'">
          <span>对方玩家ID</span>
          <input
            v-model="targetUserId"
            inputmode="numeric"
            @change="switchChannel"
          />
        </label>
      </aside>

      <section class="mb-chat">
        <header>
          <div>
            <span class="mb-kicker">CURRENT CHANNEL</span>
            <h2>{{ channelLabel }}</h2>
          </div>
          <span class="mb-channel-id">{{ activeChannelId }}</span>
        </header>

        <div class="mb-messages">
          <article
            v-for="message in messages"
            :key="message.id"
            :class="{
              'is-own': message.senderUserId === user.id,
              'is-recalled': message.status === 'recalled',
            }"
          >
            <header>
              <strong>{{ message.senderUsername }}</strong>
              <span>{{ message.createdAt }}</span>
              <em v-if="message.filtered">已过滤</em>
            </header>
            <p>{{ message.content }}</p>
            <button
              v-if="
                message.senderUserId === user.id && message.status === 'active'
              "
              type="button"
              @click="recallMessage(message)"
            >
              撤回
            </button>
          </article>
          <p v-if="!messages.length" class="mb-empty">暂无消息</p>
        </div>

        <form class="mb-compose" @submit.prevent="sendMessage">
          <input v-model="messageText" maxlength="500" placeholder="输入消息" />
          <button type="submit" :disabled="busy">发送</button>
        </form>
      </section>
    </section>

    <p v-if="toast" class="mb-toast">{{ toast }}</p>

    <span
      class="mb-observability"
      :data-message-count="messages.length"
      :data-realtime-status="realtimeStatus"
      :data-active-channel="activeChannelId"
    />
  </main>
</template>
