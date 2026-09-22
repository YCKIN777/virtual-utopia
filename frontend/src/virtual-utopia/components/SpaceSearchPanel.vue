<script setup>
import { computed, ref } from 'vue';
import { worldStore } from '../stores/worldStore.js';

/**
 * 关键词检索（v1.0）：基于 data/index/search_index.json。
 * 检索结果严格按身份裁剪（本人聊天记录 + 本人主页条目 + 其他原住民的公开内容），
 * 服务端强制鉴权，无法越权读取私密内容。
 */
const emit = defineEmits(['close', 'open']);

const keyword = ref('');
const busy = ref(false);
const searched = ref(false);

const results = computed(() => worldStore.state.space.search.results);

const run = async () => {
  const query = keyword.value.trim();
  if (!query || busy.value) return;
  busy.value = true;
  try {
    const payload = await worldStore.searchSpace(query);
    if (!payload?.ok) {
      worldStore.notify(payload?.error || '检索失败', 'error');
    }
    searched.value = true;
  } finally {
    busy.value = false;
  }
};

const TYPE_LABEL = {
  public_chat: '广场公屏',
  direct_chat: '私聊',
  profile_entry: '主页条目',
  profile_comment: '主页留言',
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (input) => String(input).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const jump = (item) => {
  emit('open', item);
};
</script>

<template>
  <Teleport to="body">
    <div class="vu-search-overlay" @click.self="emit('close')">
      <div class="vu-search-card" role="dialog" aria-label="关键词检索">
        <header class="vu-search-head">
          <strong>关键词检索</strong>
          <small>仅可检索本人聊天记录、本人主页条目与其他原住民的公开内容</small>
          <button type="button" class="vu-search-close" @click="emit('close')">✕</button>
        </header>

        <div class="vu-search-input">
          <input
            v-model="keyword"
            type="text"
            maxlength="60"
            placeholder="输入关键词，如「矮竹」「出游」…"
            @keyup.enter="run"
          />
          <button type="button" :disabled="busy || !keyword.trim()" @click="run">
            {{ busy ? '检索中' : '检索' }}
          </button>
        </div>

        <div class="vu-search-list">
          <p v-if="!searched" class="vu-search-empty">输入关键词开始检索。</p>
          <p v-else-if="!results.length" class="vu-search-empty">没有匹配结果。</p>
          <button
            v-for="item in results"
            :key="item.docId"
            type="button"
            class="vu-search-item"
            @click="jump(item)"
          >
            <span class="vu-search-tag">{{ TYPE_LABEL[item.type] || item.type }}</span>
            <span v-if="item.visibility === 'private'" class="vu-search-tag vu-search-tag--private">私密</span>
            <span class="vu-search-snippet">{{ item.snippet || item.text }}</span>
            <span class="vu-search-meta">{{ item.ownerName || '' }} · {{ formatTime(item.at) }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vu-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 30, 26, 0.32);
  backdrop-filter: blur(2px);
}
.vu-search-card {
  width: min(560px, calc(100vw - 48px));
  max-height: min(72vh, 620px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 18px 48px rgba(18, 32, 26, 0.22);
  overflow: hidden;
}
.vu-search-head {
  position: relative;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #e3e3e8;
}
.vu-search-head strong {
  display: block;
  font-size: 15px;
  color: #1d1d1f;
}
.vu-search-head small {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: #6e6e73;
  padding-right: 28px;
}
.vu-search-close {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: transparent;
  color: #6e6e73;
  font-size: 15px;
  cursor: pointer;
  border-radius: 8px;
  padding: 2px 6px;
}
.vu-search-close:hover {
  background: #f1f1f4;
  color: #1d1d1f;
}
.vu-search-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e3e3e8;
}
.vu-search-input input {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #e3e3e8;
  background: #fbfbfd;
  font-size: 13px;
  outline: none;
}
.vu-search-input input:focus {
  border-color: #2fa84f;
  background: #ffffff;
}
.vu-search-input button {
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: #2fa84f;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.vu-search-input button:disabled {
  opacity: 0.45;
  cursor: default;
}
.vu-search-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 14px;
  background: #fbfbfd;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vu-search-empty {
  margin: 14px 4px;
  font-size: 12.5px;
  color: #a1a1a6;
  text-align: center;
}
.vu-search-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #ededf0;
  background: #ffffff;
  cursor: pointer;
}
.vu-search-item:hover {
  border-color: rgba(47, 168, 79, 0.4);
}
.vu-search-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(47, 168, 79, 0.12);
  color: #258a41;
  font-size: 10.5px;
}
.vu-search-tag--private {
  background: rgba(110, 110, 115, 0.12);
  color: #6e6e73;
}
.vu-search-snippet {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: #1d1d1f;
  line-height: 1.45;
}
.vu-search-meta {
  display: block;
  margin-top: 4px;
  font-size: 10.5px;
  color: #a1a1a6;
}
</style>
