<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { worldStore } from '../stores/worldStore.js';

/**
 * 主页四板块（空间社交内容层）：
 *   工作计划 / 出游记录 / 生活随记 / 展示板 —— 每条独立【公开 / 私密】；
 *   公开内容其他原住民可浏览、留言、私信邀约；私密内容仅作者本人可读。
 * 数据落 data/users/<userId>/profile.json（JSON 分片存储），检索经权限裁剪。
 */
const props = defineProps({
  ownerId: { type: [String, Number], default: 'me' },
  ownerName: { type: String, default: '' },
});

const BOARDS = [
  { id: 'work_plan', label: '工作计划' },
  { id: 'travel_log', label: '出游记录' },
  { id: 'life_note', label: '生活随记' },
  { id: 'board', label: '展示板' },
];

const isSelf = computed(() => String(props.ownerId) === 'me');

const entries = ref([]);
const commentsMap = reactive({});
const loading = ref(true);
const busy = ref(false);
const drafting = reactive({
  open: false,
  id: '',
  board: 'work_plan',
  title: '',
  body: '',
  visibility: 'public',
});
const commentDraft = reactive({});

const groupByBoard = computed(() =>
  BOARDS.map((board) => ({
    ...board,
    items: entries.value.filter((entry) => entry.board === board.id),
  })),
);

const load = async () => {
  loading.value = true;
  try {
    const payload = await worldStore.loadSpaceProfile(props.ownerId);
    if (payload?.ok) {
      entries.value = Array.isArray(payload.entries) ? payload.entries : [];
      Object.keys(payload.comments || {}).forEach((entryId) => {
        commentsMap[entryId] = payload.comments[entryId];
      });
    } else if (payload?.error) {
      worldStore.notify(payload.error, 'error');
    }
  } finally {
    loading.value = false;
  }
};

const resetDraft = () => {
  drafting.open = false;
  drafting.id = '';
  drafting.board = 'work_plan';
  drafting.title = '';
  drafting.body = '';
  drafting.visibility = 'public';
};

const editEntry = (entry) => {
  drafting.open = true;
  drafting.id = entry.id;
  drafting.board = entry.board;
  drafting.title = entry.title;
  drafting.body = entry.body || '';
  drafting.visibility = entry.visibility;
};

const submitDraft = async () => {
  if (busy.value) return;
  if (!drafting.title.trim()) {
    worldStore.notify('请填写标题', 'info');
    return;
  }
  busy.value = true;
  try {
    const payload = await worldStore.saveSpaceProfileEntry({
      id: drafting.id || undefined,
      board: drafting.board,
      title: drafting.title.trim(),
      body: drafting.body.trim(),
      visibility: drafting.visibility,
    });
    if (payload?.ok) {
      worldStore.notify(drafting.id ? '条目已更新' : '条目已发布', 'success');
      resetDraft();
      await load();
    } else {
      worldStore.notify(payload?.error || '保存失败', 'error');
    }
  } finally {
    busy.value = false;
  }
};

const toggleVisibility = async (entry) => {
  const next = entry.visibility === 'public' ? 'private' : 'public';
  const payload = await worldStore.saveSpaceProfileEntry({
    id: entry.id,
    board: entry.board,
    title: entry.title,
    body: entry.body,
    images: entry.images,
    visibility: next,
  });
  if (payload?.ok) {
    entry.visibility = next;
    worldStore.notify(next === 'public' ? '已设为公开' : '已设为私密', 'success');
  } else {
    worldStore.notify(payload?.error || '切换失败', 'error');
  }
};

const removeEntry = async (entry) => {
  const payload = await worldStore.deleteSpaceProfileEntry(entry.id);
  if (payload?.ok) {
    worldStore.notify('条目已删除', 'success');
    await load();
  } else {
    worldStore.notify(payload?.error || '删除失败', 'error');
  }
};

const loadComments = async (entry) => {
  const payload = await worldStore.loadSpaceComments(props.ownerId, entry.id);
  if (payload?.ok) {
    commentsMap[entry.id] = payload.comments;
  }
};

const submitComment = async (entry) => {
  const text = (commentDraft[entry.id] || '').trim();
  if (!text) return;
  const payload = await worldStore.createSpaceComment(props.ownerId, entry.id, text);
  if (payload?.ok) {
    commentDraft[entry.id] = '';
    await loadComments(entry);
  } else {
    worldStore.notify(payload?.error || '留言失败', 'error');
  }
};

const inviteToChat = (owner) => {
  worldStore.notify(`已向 ${owner || props.ownerName || '对方'} 发出交流邀约`, 'success');
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

watch(() => props.ownerId, load);
onMounted(load);
</script>

<template>
  <section class="vu-board">
    <header class="vu-board__head">
      <div>
        <h3>主页四板块 · 空间社交</h3>
        <small>工作计划 / 出游记录 / 生活随记 / 展示板 · 每条独立公开或私密</small>
      </div>
      <button
        v-if="isSelf"
        type="button"
        class="vu-board__add"
        @click="drafting.open ? resetDraft() : (drafting.open = true)"
      >
        {{ drafting.open ? '收起' : '+ 新增条目' }}
      </button>
    </header>

    <form v-if="isSelf && drafting.open" class="vu-board__form" @submit.prevent="submitDraft">
      <div class="vu-board__row">
        <select v-model="drafting.board">
          <option v-for="board in BOARDS" :key="board.id" :value="board.id">
            {{ board.label }}
          </option>
        </select>
        <select v-model="drafting.visibility">
          <option value="public">公开</option>
          <option value="private">私密</option>
        </select>
      </div>
      <input v-model="drafting.title" type="text" maxlength="80" placeholder="标题" />
      <textarea v-model="drafting.body" rows="3" maxlength="2000" placeholder="正文（可选）" />
      <div class="vu-board__row vu-board__row--end">
        <button type="submit" :disabled="busy">{{ drafting.id ? '保存修改' : '发布' }}</button>
      </div>
    </form>

    <p v-if="loading" class="vu-board__empty">加载中…</p>

    <template v-else>
      <div v-for="board in groupByBoard" :key="board.id" class="vu-board__group">
        <h4>{{ board.label }}<span v-if="board.items.length"> · {{ board.items.length }}</span></h4>
        <p v-if="!board.items.length" class="vu-board__empty">暂无内容</p>
        <article v-for="entry in board.items" :key="entry.id" class="vu-board__entry">
          <div class="vu-board__entry-head">
            <strong>{{ entry.title }}</strong>
            <span class="vu-board__badge" :class="{ 'vu-board__badge--private': entry.visibility === 'private' }">
              {{ entry.visibility === 'public' ? '公开' : '私密' }}
            </span>
          </div>
          <p v-if="entry.body" class="vu-board__body">{{ entry.body }}</p>
          <footer class="vu-board__foot">
            <span>{{ formatTime(entry.updatedAt || entry.createdAt) }}</span>
            <span v-if="isSelf" class="vu-board__ops">
              <button type="button" @click="toggleVisibility(entry)">
                设为{{ entry.visibility === 'public' ? '私密' : '公开' }}
              </button>
              <button type="button" @click="editEntry(entry)">编辑</button>
              <button type="button" class="vu-board__danger" @click="removeEntry(entry)">删除</button>
            </span>
          </footer>

          <div v-if="!isSelf" class="vu-board__comments">
            <button type="button" class="vu-board__load" @click="loadComments(entry)">
              {{ commentsMap[entry.id] ? '刷新留言' : '查看留言' }}
            </button>
            <ul v-if="commentsMap[entry.id]?.length">
              <li v-for="comment in commentsMap[entry.id]" :key="comment.id">
                <b>{{ comment.fromUsername }}</b> {{ comment.text }}
              </li>
            </ul>
            <div class="vu-board__comment-form">
              <input
                v-model="commentDraft[entry.id]"
                type="text"
                maxlength="300"
                placeholder="留言…"
                @keyup.enter="submitComment(entry)"
              />
              <button type="button" @click="submitComment(entry)">留言</button>
            </div>
            <button type="button" class="vu-board__invite" @click="inviteToChat(entry)">
              私信邀约
            </button>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.vu-board {
  margin-top: 18px;
  padding: 16px 18px 18px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e3e3e8;
}
.vu-board__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.vu-board__head h3 {
  margin: 0;
  font-size: 14px;
  color: #1d1d1f;
}
.vu-board__head small {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  color: #6e6e73;
}
.vu-board__add {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: none;
  background: rgba(47, 168, 79, 0.12);
  color: #258a41;
  font-size: 12px;
  cursor: pointer;
}
.vu-board__add:hover {
  background: rgba(47, 168, 79, 0.2);
}
.vu-board__form {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #fbfbfd;
  border: 1px solid #ededf0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vu-board__row {
  display: flex;
  gap: 8px;
}
.vu-board__row--end {
  justify-content: flex-end;
}
.vu-board__form select,
.vu-board__form input,
.vu-board__form textarea {
  flex: 1;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e3e3e8;
  background: #fff;
  font-size: 12.5px;
  color: #1d1d1f;
  outline: none;
  font-family: inherit;
}
.vu-board__form button {
  height: 32px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  background: #2fa84f;
  color: #fff;
  font-size: 12.5px;
  cursor: pointer;
}
.vu-board__group {
  margin-top: 16px;
}
.vu-board__group h4 {
  margin: 0 0 8px;
  font-size: 12.5px;
  color: #6e6e73;
  font-weight: 600;
}
.vu-board__empty {
  margin: 6px 0 0;
  font-size: 12px;
  color: #a1a1a6;
}
.vu-board__entry {
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid #ededf0;
  background: #fbfbfd;
  margin-bottom: 8px;
}
.vu-board__entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.vu-board__entry-head strong {
  font-size: 13px;
  color: #1d1d1f;
}
.vu-board__badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  background: rgba(47, 168, 79, 0.12);
  color: #258a41;
}
.vu-board__badge--private {
  background: rgba(110, 110, 115, 0.12);
  color: #6e6e73;
}
.vu-board__body {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: #3a3a3c;
  white-space: pre-wrap;
}
.vu-board__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 10.5px;
  color: #a1a1a6;
}
.vu-board__ops {
  display: flex;
  gap: 8px;
}
.vu-board__ops button,
.vu-board__load,
.vu-board__invite {
  border: none;
  background: transparent;
  color: #258a41;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.vu-board__ops button:hover,
.vu-board__load:hover,
.vu-board__invite:hover {
  background: rgba(47, 168, 79, 0.12);
}
.vu-board__danger {
  color: #e0483b;
}
.vu-board__comments {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e3e3e8;
}
.vu-board__comments ul {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vu-board__comments li {
  font-size: 12px;
  color: #3a3a3c;
}
.vu-board__comment-form {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.vu-board__comment-form input {
  flex: 1;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #e3e3e8;
  background: #fff;
  font-size: 12px;
  outline: none;
}
.vu-board__comment-form button {
  height: 30px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: rgba(47, 168, 79, 0.14);
  color: #258a41;
  font-size: 12px;
  cursor: pointer;
}
</style>
