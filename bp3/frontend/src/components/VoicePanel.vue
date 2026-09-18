<script setup>
import { onBeforeUnmount, reactive, ref } from 'vue';
import { createVoiceClient } from '../services/voiceClient.js';

const props = defineProps({
  api: {
    type: Object,
    required: true,
  },
  user: {
    type: Object,
    required: true,
  },
});

const client = ref(null);
const state = reactive({
  status: 'idle',
  muted: false,
  participants: [],
  remoteAudioCount: 0,
  error: '',
});
const busy = ref(false);

const applyState = (nextState) => {
  state.status = nextState.status;
  state.muted = nextState.muted;
  state.participants = nextState.participants;
  state.remoteAudioCount = nextState.remoteAudioCount || 0;
  state.error = nextState.error?.message || '';
};

const join = async () => {
  if (busy.value) {
    return;
  }

  busy.value = true;
  state.error = '';

  try {
    const voiceClient = createVoiceClient({
      api: props.api,
      onState: applyState,
      onError: (error) => {
        state.error = error.message || '语音连接失败';
      },
    });

    client.value = voiceClient;
    await voiceClient.start();
  } catch (error) {
    state.error = error.message || '语音连接失败';
    client.value = null;
  } finally {
    busy.value = false;
  }
};

const leave = async () => {
  busy.value = true;

  try {
    await client.value?.stop();
    client.value = null;
    state.status = 'idle';
    state.participants = [];
  } finally {
    busy.value = false;
  }
};

const toggleMute = async () => {
  if (!client.value) {
    return;
  }

  busy.value = true;

  try {
    await client.value.setMuted(!state.muted);
  } catch (error) {
    state.error = error.message || '静音操作失败';
  } finally {
    busy.value = false;
  }
};

const moderate = async (participant, action) => {
  busy.value = true;

  try {
    await props.api.moderateVoice('world-main', participant.userId, action);
    const nextMuted =
      action === 'mute'
        ? true
        : action === 'unmute'
          ? false
          : participant.muted;

    state.participants = state.participants.map((item) =>
      item.userId === participant.userId
        ? {
            ...item,
            muted: nextMuted,
          }
        : item,
    );
  } catch (error) {
    state.error = error.message || '语音管理失败';
  } finally {
    busy.value = false;
  }
};

onBeforeUnmount(() => {
  void client.value?.stop();
});
</script>

<template>
  <section
    class="bp3-panel bp3-voice-panel"
    :data-remote-audio-count="state.remoteAudioCount"
    :data-voice-status="state.status"
  >
    <header class="bp3-panel__header">
      <div>
        <span class="bp3-kicker">WORLD VOICE</span>
        <h2>世界语音</h2>
      </div>
      <span class="bp3-status" :class="`is-${state.status}`">
        {{
          state.status === 'connected'
            ? '已连接'
            : state.status === 'connecting'
              ? '连接中'
              : state.status === 'reconnecting'
                ? '重连中'
                : state.status === 'kicked'
                  ? '已移出'
                  : '未加入'
        }}
      </span>
    </header>

    <div class="bp3-action-row">
      <button
        v-if="state.status === 'idle'"
        type="button"
        class="bp3-button is-primary"
        :disabled="busy"
        @click="join"
      >
        加入语音
      </button>
      <button
        v-else
        type="button"
        class="bp3-button"
        :disabled="busy"
        @click="leave"
      >
        离开语音
      </button>
      <button
        type="button"
        class="bp3-button"
        :disabled="busy || !client"
        @click="toggleMute"
      >
        {{ state.muted ? '取消静音' : '静音' }}
      </button>
    </div>

    <p v-if="state.error" class="bp3-error">
      {{ state.error }}
    </p>

    <ul class="bp3-member-list">
      <li v-for="participant in state.participants" :key="participant.userId">
        <span
          class="bp3-speaking"
          :class="{ 'is-active': participant.speaking }"
        />
        <span class="bp3-member-name">
          {{ participant.displayName }}
        </span>
        <span class="bp3-member-role">
          {{ participant.role }}
        </span>
        <span class="bp3-member-state">
          {{ participant.muted ? '静音' : '在线' }}
        </span>
        <span
          v-if="
            props.user.role === 'admin' && participant.userId !== props.user.id
          "
          class="bp3-member-actions"
        >
          <button
            type="button"
            @click="
              moderate(participant, participant.muted ? 'unmute' : 'mute')
            "
          >
            {{ participant.muted ? '解除静音' : '管理静音' }}
          </button>
          <button type="button" @click="moderate(participant, 'kick')">
            移出
          </button>
        </span>
      </li>
      <li v-if="!state.participants.length" class="bp3-empty">暂无在线成员</li>
    </ul>
  </section>
</template>
