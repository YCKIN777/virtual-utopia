<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { worldStore } from '../stores/worldStore.js';

/**
 * 空间交流面板（极简轻量）：
 *   - public：中心广场穹顶公共频道（发言全域 50 户可见）
 *   - direct：就近私聊 / 宅院门口 / 宅院内部 / 偶遇 / 山脚自由交流（同一套双人会话）
 * 半透明轻量气泡，无常驻遮挡；关闭即卸载，不留残留 UI。
 */
const props = defineProps({
  mode: { type: String, default: 'public' },
  peerId: { type: [String, Number], default: '' },
  peerName: { type: String, default: '' },
  sceneLabel: { type: String, default: '' },
  scene: { type: Object, default: null },
  channel: { type: String, default: 'direct' },
});

const emit = defineEmits(['close', 'sent']);

const draft = ref('');
const busy = ref(false);
const listRef = ref(null);
let timer = null;

const messages = computed(() =>
  props.mode === 'public'
    ? worldStore.state.space.publicMessages
    : worldStore.state.space.peers[props.peerId] || [],
);

const title = computed(() =>
  props.mode === 'public'
    ? '生活广场 · 公共频道'
    : `与 ${props.peerName || '邻居'} 交流`,
);

const subtitle = computed(() => {
  if (props.mode === 'public') return '发言对全部在线原住民可见';
  return props.sceneLabel || '就近私聊 · 仅双方可见';
});

const myId = computed(() => worldStore.state.user?.id);

const scrollToEnd = async () => {
  await nextTick();
  const node = listRef.value;
  if (node) node.scrollTop = node.scrollHeight;
};

const refresh = async () => {
  if (props.mode === 'public') {
    await worldStore.loadSpacePublicMessages(60);
  } else if (props.peerId) {
    await worldStore.loadSpaceConversation(props.peerId, 60);
  }
  await scrollToEnd();
};

const submit = async () => {
  const text = draft.value.trim();
  if (!text || busy.value) return;
  busy.value = true;
  try {
    const result =
      props.mode === 'public'
        ? await worldStore.sendSpacePublicMessage({ text, scene: props.scene })
        : await worldStore.sendSpaceConversationMessage(props.peerId, {
            text,
            scene: props.scene,
            channel: props.channel,
          });
    if (result?.ok) {
      draft.value = '';
      await scrollToEnd();
      if (props.mode === 'public') {
        // 兼容既有广场频道：同步一份到历史频道，保证旧视图不空
        void worldStore.sendWorldChat({ content: text });
      }
      emit('sent', result);
    } else {
      worldStore.notify(result?.error || '发送失败', 'error');
    }
  } finally {
    busy.value = false;
  }
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

watch(() => [props.mode, props.peerId], refresh);

onMounted(async () => {
  await refresh();
  timer = setInterval(() => {
    void refresh();
  }, 4000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <Teleport to="body">
    <div class="vu-space-overlay" @click.self="emit('close')">
      <div class="vu-space-card" role="dialog" :aria-label="title">
        <header class="vu-space-head">
          <div>
            <strong>{{ title }}</strong>
            <small>{{ subtitle }}</small>
          </div>
          <button type="button" class="vu-space-close" @click="emit('close')">✕</button>
        </header>

        <div ref="listRef" class="vu-space-list">
          <p v-if="!messages.length" class="vu-space-empty">
            {{ mode === 'public' ? '频道还很安静，说点什么吧。' : '还没有聊天记录，打个招呼。' }}
          </p>
          <div
            v-for="item in messages"
            :key="item.id"
            class="vu-space-bubble"
            :class="{ 'vu-space-bubble--mine': String(item.fromUserId) === String(myId) }"
          >
            <span class="vu-space-name">
              {{ String(item.fromUserId) === String(myId) ? '我' : item.fromUsername || '邻居' }}
            </span>
            <span class="vu-space-text">{{ item.text }}</span>
            <span class="vu-space-time">
              {{ formatTime(item.createdAt) }}<template v-if="item.scene?.zone"> · {{ item.scene.zone }}</template>
            </span>
          </div>
        </div>

        <div class="vu-space-input">
          <input
            v-model="draft"
            type="text"
            maxlength="500"
            :placeholder="mode === 'public' ? '向全体原住民发言…' : '输入消息…'"
            @keyup.enter="submit"
          />
          <button type="button" :disabled="busy || !draft.trim()" @click="submit">发送</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vu-space-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 30, 26, 0.32);
  backdrop-filter: blur(2px);
}
.vu-space-card {
  width: min(560px, calc(100vw - 48px));
  max-height: min(72vh, 620px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 18px 48px rgba(18, 32, 26, 0.22);
  overflow: hidden;
}
.vu-space-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #e3e3e8;
}
.vu-space-head strong {
  display: block;
  font-size: 15px;
  color: #1d1d1f;
}
.vu-space-head small {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: #6e6e73;
}
.vu-space-close {
  border: none;
  background: transparent;
  color: #6e6e73;
  font-size: 15px;
  cursor: pointer;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 8px;
}
.vu-space-close:hover {
  background: #f1f1f4;
  color: #1d1d1f;
}
.vu-space-list {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fbfbfd;
}
.vu-space-empty {
  margin: 8px 0;
  color: #a1a1a6;
  font-size: 12.5px;
  text-align: center;
}
.vu-space-bubble {
  align-self: flex-start;
  max-width: 78%;
  padding: 7px 11px 6px;
  border-radius: 14px 14px 14px 4px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(227, 227, 232, 0.9);
  font-size: 13px;
  color: #1d1d1f;
  animation: vu-bubble-in 0.22s ease-out;
}
.vu-space-bubble--mine {
  align-self: flex-end;
  border-radius: 14px 14px 4px 14px;
  background: rgba(47, 168, 79, 0.14);
  border-color: rgba(47, 168, 79, 0.26);
}
.vu-space-name {
  display: block;
  font-size: 10.5px;
  color: #6e6e73;
  margin-bottom: 2px;
}
.vu-space-text {
  display: block;
  line-height: 1.45;
  word-break: break-word;
}
.vu-space-time {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #a1a1a6;
  text-align: right;
}
.vu-space-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid #e3e3e8;
  background: #ffffff;
}
.vu-space-input input {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #e3e3e8;
  background: #fbfbfd;
  font-size: 13px;
  color: #1d1d1f;
  outline: none;
}
.vu-space-input input:focus {
  border-color: #2fa84f;
  background: #ffffff;
}
.vu-space-input button {
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: #2fa84f;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}
.vu-space-input button:disabled {
  opacity: 0.45;
  cursor: default;
}
@keyframes vu-bubble-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
