<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { aiChatStore, SCENE_META } from '../stores/aiChatStore.js';
import { isAiChatAvailable } from '../services/sceneClient.js';
import { worldStore } from '../stores/worldStore.js';

const open = ref(false);
const input = ref('');
const listRef = ref(null);

const loggedIn = computed(() => isAiChatAvailable());
const conversation = computed(() => aiChatStore.state);
const sceneMeta = computed(
  () => SCENE_META[conversation.value.sceneId] || SCENE_META.yard,
);
const sceneOptions = computed(() =>
  Object.entries(SCENE_META).map(([id, meta]) => ({ id, ...meta })),
);

const statusLabel = computed(() => {
  const { loading, status, statusDetail } = conversation.value;
  if (!loading) return '';
  if (status === 'tool_calling') return `正在查询${statusDetail || ''}…`;
  if (status === 'tool_result') return '已获取数据，正在整理回答…';
  return `${sceneMeta.value.name}的伙伴正在思考…`;
});

const switchScene = (event) => {
  aiChatStore.setScene(event.target.value);
  void scrollToBottom();
};

const approvalToolNames = computed(() =>
  (conversation.value.pendingApproval?.approval?.toolCalls ?? [])
    .map((call) => call.name)
    .join('、'),
);

const scrollToBottom = async () => {
  await nextTick();
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
};

const submitMessage = async () => {
  const content = input.value.trim();
  if (!content || conversation.value.loading) return;
  if (!loggedIn.value) {
    worldStore.notify('请先登录后再与居民对话', 'info');
    return;
  }
  input.value = '';
  try {
    await aiChatStore.sendStream(content, companions.value);
  } catch (error) {
    // 错误已写入 state.error，由浮层展示
  }
  await scrollToBottom();
};

// ---- P5.9 同行选择：勾选后约伴时同行居民一起移动（companions 透传后端 gather_move） ----
const companions = ref([]);
const residentCompanionOptions = [
  { id: 'ahe', name: '阿禾' },
  { id: 'zhiyu', name: '知予' },
  { id: 'xubai', name: '叙白' },
  { id: 'suian', name: '岁安' },
  { id: 'fenghe', name: '风禾' },
];
const toggleCompanion = (id) => {
  const index = companions.value.indexOf(id);
  if (index === -1) {
    if (companions.value.length >= 4) {
      worldStore.notify('最多选 4 位同行', 'info');
      return;
    }
    companions.value.push(id);
  } else {
    companions.value.splice(index, 1);
  }
};

const handleApproval = async (approved) => {
  try {
    await aiChatStore.resolveApproval({
      approved,
      reason: approved ? 'KIN 批准' : 'KIN 拒绝',
    });
  } catch (error) {
    // state.error 已写入
  }
  await scrollToBottom();
};

const resetChat = () => {
  aiChatStore.resetConversation();
};

const formatTime = (value) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

// ---- P5.7 语音输入 + 语音回复 ----
const voiceReply = ref(false);
const recording = ref(false);
const micSupported =
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

let recognition = null;
let lastSpokenKey = null;

const initRecognition = () => {
  if (recognition) return recognition;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || '';
    if (text) input.value = text;
  };
  recognition.onend = () => {
    recording.value = false;
  };
  recognition.onerror = () => {
    recording.value = false;
  };
  return recognition;
};

const toggleMic = () => {
  if (!micSupported) {
    worldStore.notify('当前浏览器不支持语音输入', 'info');
    return;
  }
  if (recording.value) {
    try {
      recognition?.stop();
    } catch {
      // 忽略停止异常
    }
    recording.value = false;
    return;
  }
  try {
    const rec = initRecognition();
    recording.value = true;
    rec.start();
  } catch {
    recording.value = false;
    worldStore.notify('无法启动麦克风，请检查浏览器权限', 'info');
  }
};

const speak = (text) => {
  if (!text || !voiceReply.value) return;
  try {
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;
    window.speechSynthesis?.speak(utterance);
  } catch {
    // TTS 不可用时静默降级
  }
};

// 居民回复到来时自动朗读（仅当语音回复开启）
watch(
  () => conversation.value.messages,
  (messages) => {
    if (!voiceReply.value) return;
    const last = messages?.[messages.length - 1];
    if (
      last &&
      last.role === 'assistant' &&
      !last.streaming &&
      last.id !== lastSpokenKey
    ) {
      lastSpokenKey = last.id;
      speak(last.content);
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  // 面板关闭不销毁会话（LangGraph 服务端状态保留）
  try {
    recognition?.abort();
  } catch {
    // 忽略
  }
  window.speechSynthesis?.cancel();
});
</script>

<template>
  <div class="vu-ai-chat">
    <button
      type="button"
      class="vu-ai-chat__trigger"
      :aria-expanded="open"
      @click="open = !open"
    >
      AI 对话
      <span v-if="conversation.loading" class="vu-ai-chat__dot" aria-hidden="true" />
    </button>

    <section v-if="open" class="vu-ai-chat__panel" aria-label="与 AI 居民对话">
      <header>
        <div>
          <span class="vu-kicker">AI RESIDENT</span>
          <strong>{{ sceneMeta.name }} · {{ sceneMeta.agent }}</strong>
        </div>
        <div class="vu-ai-chat__actions">
          <button
            type="button"
            :title="voiceReply ? '关闭语音回复' : '开启语音回复'"
            :aria-label="voiceReply ? '关闭语音回复' : '开启语音回复'"
            :class="{ 'is-on': voiceReply }"
            @click="voiceReply = !voiceReply"
          >
            {{ voiceReply ? '🔊' : '🔇' }}
          </button>
          <button type="button" title="新话题" aria-label="新话题" @click="resetChat">
            新话题
          </button>
          <button type="button" aria-label="关闭" @click="open = false">×</button>
        </div>
      </header>

      <!-- P5.4-15：场景分支切换（大院/木屋/藏书楼/凉亭/资源墙，切换即新话题） -->
      <label class="vu-ai-chat__scene">
        <span>场景</span>
        <select
          :value="conversation.sceneId"
          :disabled="conversation.loading"
          aria-label="切换 AI 居民场景"
          @change="switchScene"
        >
          <option
            v-for="option in sceneOptions"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }} · {{ option.agent }}
          </option>
        </select>
      </label>

      <p v-if="!loggedIn" class="vu-ai-chat__login-hint">
        请先登录（右上角「登录」）后，再与 AI 居民对话。
      </p>

      <div ref="listRef" class="vu-ai-chat__messages">
        <article
          v-for="message in conversation.messages"
          :key="message.id"
          class="vu-ai-chat__message"
          :class="message.role === 'user' ? 'is-user' : 'is-assistant'"
        >
          <div class="vu-ai-chat__message-head">
            <strong>{{ message.role === 'user' ? '我' : sceneMeta.agent }}</strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </div>
          <p>
            {{ message.content
            }}<span
              v-if="message.streaming"
              class="vu-ai-chat__caret"
              aria-hidden="true"
            />
          </p>
        </article>

        <p v-if="conversation.messages.length === 0" class="vu-ai-chat__empty">
          与{{ sceneMeta.name }}的 AI 居民{{ sceneMeta.agent }}聊聊吧 ——
          {{ sceneMeta.hint }}
        </p>

        <p v-if="statusLabel" class="vu-ai-chat__status" role="status">
          <span class="vu-ai-chat__spinner" aria-hidden="true" />
          {{ statusLabel }}
        </p>

        <!-- HITL：KIN 审批卡片 -->
        <div
          v-if="conversation.pendingApproval"
          class="vu-ai-chat__approval"
          role="dialog"
          aria-label="需要 KIN 审批"
        >
          <p class="vu-ai-chat__approval-title">需要 KIN 审批</p>
          <p class="vu-ai-chat__approval-body">
            {{ sceneMeta.agent }}请求执行以下操作：{{ approvalToolNames }}。此操作需要管理方（KIN）确认后方可执行。
          </p>
          <div class="vu-ai-chat__approval-actions">
            <button
              type="button"
              class="vu-ai-chat__approval-allow"
              :disabled="conversation.loading"
              @click="handleApproval(true)"
            >
              批准
            </button>
            <button
              type="button"
              class="vu-ai-chat__approval-deny"
              :disabled="conversation.loading"
              @click="handleApproval(false)"
            >
              拒绝
            </button>
          </div>
        </div>
      </div>

      <p v-if="conversation.error" class="vu-ai-chat__error" role="alert">
        {{ conversation.error }}
      </p>

      <div v-if="loggedIn" class="vu-ai-chat__companions">
        <span class="vu-ai-chat__companions-label">同行：</span>
        <button
          v-for="option in residentCompanionOptions"
          :key="option.id"
          type="button"
          class="vu-ai-chat__companion-chip"
          :class="{ 'is-on': companions.includes(option.id) }"
          :disabled="conversation.loading"
          @click="toggleCompanion(option.id)"
        >
          {{ option.name }}
        </button>
      </div>

      <form class="vu-ai-chat__form" @submit.prevent="submitMessage">
        <input
          v-model="input"
          maxlength="200"
          :placeholder="loggedIn ? '输入消息，与 AI 居民对话' : '登录后启用 AI 对话'"
          :disabled="conversation.loading || !loggedIn"
          @keydown.enter.prevent="submitMessage"
        />
        <button
          type="button"
          class="vu-ai-chat__mic"
          :title="micSupported ? '按住说话（语音输入）' : '当前浏览器不支持语音输入'"
          :aria-label="micSupported ? '语音输入' : '不支持语音输入'"
          :class="{ 'is-recording': recording }"
          :disabled="conversation.loading || !loggedIn"
          @click="toggleMic"
        >
          {{ recording ? '◉' : '🎤' }}
        </button>
        <button
          type="submit"
          :disabled="conversation.loading || !loggedIn || !input.trim()"
        >
          {{ conversation.loading ? '…' : '发送' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.vu-ai-chat {
  position: fixed;
  right: 22px;
  bottom: 96px;
  z-index: 36;
  display: grid;
  justify-items: end;
  gap: 8px;
}

.vu-ai-chat__trigger,
.vu-ai-chat__panel {
  box-shadow: 0 12px 34px rgba(13, 29, 27, 0.24);
}

.vu-ai-chat__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  background: #6d2e5c;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.vu-ai-chat__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd166;
  animation: vu-ai-pulse 1s ease-in-out infinite;
}

@keyframes vu-ai-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.vu-ai-chat__panel {
  width: min(380px, calc(100vw - 28px));
  height: min(520px, 70vh);
  display: grid;
  grid-template-rows: auto auto auto 1fr auto auto;
  overflow: hidden;
  border: 1px solid rgba(28, 62, 54, 0.22);
  border-radius: 8px;
  background: #f7f5ef;
  color: #243d37;
}

.vu-ai-chat__panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #dfe4dc;
  background: #fff;
}

.vu-ai-chat__panel header strong {
  display: block;
  margin-top: 2px;
}

.vu-ai-chat__actions {
  display: flex;
  gap: 6px;
}

.vu-ai-chat__actions button {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 50%;
  background: #edf1eb;
  color: #41564f;
  font-size: 13px;
  cursor: pointer;
}

.vu-ai-chat__login-hint {
  margin: 0;
  padding: 8px 14px;
  background: #fff8e6;
  border-bottom: 1px solid #efe3c4;
  color: #8a6d2f;
  font-size: 12px;
  line-height: 1.5;
}

.vu-ai-chat__scene {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid #dfe4dc;
  background: #fff;
  font-size: 12px;
}

.vu-ai-chat__scene span {
  color: #8b9791;
}

.vu-ai-chat__scene select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid #cfd8d0;
  border-radius: 5px;
  background: #fbfcfa;
  color: #243d37;
  font: inherit;
}

.vu-ai-chat__messages {
  overflow: auto;
  padding: 12px;
}

.vu-ai-chat__message {
  margin-bottom: 10px;
  max-width: 86%;
  padding: 9px 10px;
  border-radius: 8px;
  background: #fff;
}

.vu-ai-chat__message.is-user {
  margin-left: auto;
  background: #2d6c5c;
  color: #fff;
}

.vu-ai-chat__message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vu-ai-chat__message.is-user .vu-ai-chat__message-head {
  color: rgba(255, 255, 255, 0.85);
}

.vu-ai-chat__message-head span {
  color: #89958f;
  font-size: 10px;
}

.vu-ai-chat__message.is-user .vu-ai-chat__message-head span {
  color: rgba(255, 255, 255, 0.7);
}

.vu-ai-chat__message p {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.vu-ai-chat__caret {
  display: inline-block;
  width: 1px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: #6d2e5c;
  animation: vu-ai-blink 0.8s step-end infinite;
}

.vu-ai-chat__message.is-user .vu-ai-chat__caret {
  background: #fff;
}

@keyframes vu-ai-blink {
  50% {
    opacity: 0;
  }
}

.vu-ai-chat__empty {
  color: #8b9791;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
  padding: 16px 8px;
}

.vu-ai-chat__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
  color: #6d2e5c;
  font-size: 12px;
}

.vu-ai-chat__spinner {
  width: 14px;
  height: 14px;
  flex: none;
  border: 2px solid rgba(109, 46, 92, 0.25);
  border-top-color: #6d2e5c;
  border-radius: 50%;
  animation: vu-ai-spin 0.8s linear infinite;
}

@keyframes vu-ai-spin {
  to {
    transform: rotate(360deg);
  }
}

.vu-ai-chat__approval {
  margin-top: 6px;
  padding: 12px;
  border: 1px solid #e8c35a;
  border-radius: 8px;
  background: #fff8e6;
}

.vu-ai-chat__approval-title {
  margin: 0 0 4px;
  color: #8a6d2f;
  font-weight: 600;
  font-size: 13px;
}

.vu-ai-chat__approval-body {
  margin: 0;
  color: #8a6d2f;
  font-size: 12px;
  line-height: 1.5;
}

.vu-ai-chat__approval-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.vu-ai-chat__approval-actions button {
  padding: 6px 14px;
  border: 0;
  border-radius: 5px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.vu-ai-chat__approval-allow {
  background: #2d6c5c;
  color: #fff;
}

.vu-ai-chat__approval-deny {
  background: #fff;
  border: 1px solid #cfd8d0 !important;
  color: #243d37;
}

.vu-ai-chat__approval-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.vu-ai-chat__error {
  margin: 0;
  padding: 8px 14px;
  background: #fdecea;
  border-top: 1px solid #f0d3cf;
  color: #b03a2c;
  font-size: 12px;
}

.vu-ai-chat__companions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 0;
}
.vu-ai-chat__companions-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.vu-ai-chat__companion-chip {
  padding: 3px 9px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.vu-ai-chat__companion-chip:hover {
  border-color: rgba(255, 255, 255, 0.6);
}
.vu-ai-chat__companion-chip.is-on {
  background: #6d2e5c;
  border-color: #6d2e5c;
  color: #fff;
}
.vu-ai-chat__companion-chip:disabled {
  opacity: 0.5;
  cursor: default;
}
.vu-ai-chat__form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  padding: 10px;
  border-top: 1px solid #dfe4dc;
  background: #fff;
}

.vu-ai-chat__form input {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #cfd8d0;
  border-radius: 5px;
  font: inherit;
}

.vu-ai-chat__form button {
  padding: 8px 13px;
  border: 0;
  border-radius: 5px;
  background: #6d2e5c;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.vu-ai-chat__actions button.is-on {
  background: #2d6c5c;
  color: #fff;
}

.vu-ai-chat__mic {
  padding: 8px 10px !important;
  background: #edf1eb !important;
  color: #41564f !important;
  font-size: 15px !important;
}

.vu-ai-chat__mic.is-recording {
  background: #b03a2c !important;
  color: #fff !important;
  animation: vu-ai-pulse 1s ease-in-out infinite;
}

.vu-ai-chat__mic:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.vu-ai-chat__form button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 760px) {
  .vu-ai-chat {
    right: 12px;
    bottom: 84px;
  }

  .vu-ai-chat__panel {
    height: min(480px, 65vh);
  }
}
</style>
