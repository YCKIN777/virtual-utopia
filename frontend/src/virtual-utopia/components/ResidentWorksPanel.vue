<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { worldStore } from '../stores/worldStore.js';

// 作品模块：与个人主页「备忘」完全独立，自包含 localStorage 持久化，
// 不依赖后端内核，也不读取任何备忘(card)子项。
const user = computed(() => worldStore.state.user);
const storageKey = computed(() => `vu:works:${user.value?.username || 'guest'}`);

const works = ref([]);
const dialogOpen = ref(false);
const editingId = ref(null);
const busy = ref(false);
const errorMessage = ref('');
const imagePreview = ref('');

const form = reactive({
  title: '',
  body: '',
  permission: 'self',
});

const permissionLabel = (p) => (p === 'residents' ? '原住民可见' : '仅自己可见');

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const load = () => {
  try {
    const raw = localStorage.getItem(storageKey.value);
    works.value = raw ? JSON.parse(raw) : [];
  } catch {
    works.value = [];
  }
};

const persist = () => {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(works.value));
  } catch {
    errorMessage.value = '本地存储写入失败，请清理浏览器空间后重试';
  }
};

const onFile = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    errorMessage.value = '请选择图片文件';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    errorMessage.value = '图片请控制在 2MB 以内';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imagePreview.value = reader.result;
    errorMessage.value = '';
  };
  reader.readAsDataURL(file);
};

const openCreate = () => {
  editingId.value = null;
  form.title = '';
  form.body = '';
  form.permission = 'self';
  imagePreview.value = '';
  errorMessage.value = '';
  dialogOpen.value = true;
};

const openEdit = (work) => {
  editingId.value = work.id;
  form.title = work.title || '';
  form.body = work.body || '';
  form.permission = work.permission || 'self';
  imagePreview.value = work.image || '';
  errorMessage.value = '';
  dialogOpen.value = true;
};

const submit = () => {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title && !body && !imagePreview.value) {
    errorMessage.value = '请填写标题、描述或上传图片';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  const existing = editingId.value
    ? works.value.find((w) => w.id === editingId.value)
    : null;
  const entry = {
    id: editingId.value || `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    image: imagePreview.value || '',
    permission: form.permission,
    username: user.value?.displayName || user.value?.username || '我',
    createdAt:
      existing?.createdAt || new Date().toISOString(),
  };
  if (editingId.value) {
    works.value = works.value.map((w) => (w.id === editingId.value ? entry : w));
  } else {
    works.value = [entry, ...works.value];
  }
  persist();
  busy.value = false;
  dialogOpen.value = false;
};

const remove = (work) => {
  works.value = works.value.filter((w) => w.id !== work.id);
  persist();
};

onMounted(() => {
  load();
});
</script>

<template>
  <section class="rw-panel">
    <div class="rw-head">
      <div class="rw-head__meta">
        <strong>我的作品</strong>
        <span>上传图文作品，单条可设可见权限</span>
      </div>
      <button type="button" class="rw-add" @click="openCreate">+ 上传作品</button>
    </div>

    <div v-if="!works.length" class="rw-empty">
      还没有作品，点击「+ 上传作品」发布第一条吧
    </div>

    <div v-else class="rw-list">
      <article v-for="work in works" :key="work.id" class="rw-card">
        <div class="rw-card__media">
          <img v-if="work.image" :src="work.image" alt="作品图" class="rw-card__img" />
          <div v-else class="rw-card__ph">无图</div>
        </div>
        <div class="rw-card__main">
          <div class="rw-card__title">
            <strong>{{ work.title || '（无标题）' }}</strong>
            <span class="rw-badge" :class="`rw-badge--${work.permission}`">
              {{ permissionLabel(work.permission) }}
            </span>
          </div>
          <p v-if="work.body" class="rw-card__body">{{ work.body }}</p>
          <small class="rw-card__time">
            {{ work.username }} · {{ formatDate(work.createdAt) }}
          </small>
        </div>
        <div class="rw-card__actions">
          <button type="button" class="rw-mini" @click="openEdit(work)">编辑</button>
          <button type="button" class="rw-mini rw-mini--danger" @click="remove(work)">
            删除
          </button>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div
        v-if="dialogOpen"
        class="rw-dialog-backdrop"
        @mousedown.self="dialogOpen = false"
      >
        <section class="rw-dialog" role="dialog" aria-modal="true">
          <header class="rw-dialog__header">
            <h3>{{ editingId ? '编辑作品' : '上传作品' }}</h3>
            <button
              type="button"
              class="rw-close"
              aria-label="关闭"
              @click="dialogOpen = false"
            >
              ✕
            </button>
          </header>

          <div class="rw-dialog__body">
            <label class="rw-field">
              <span>作品图</span>
              <input type="file" accept="image/*" @change="onFile" />
              <img v-if="imagePreview" :src="imagePreview" alt="预览" class="rw-preview" />
            </label>

            <label class="rw-field">
              <span>标题</span>
              <input
                v-model="form.title"
                type="text"
                maxlength="120"
                placeholder="给作品起个标题"
              />
            </label>

            <label class="rw-field">
              <span>文字描述</span>
              <textarea
                v-model="form.body"
                rows="4"
                maxlength="2000"
                placeholder="写下作品说明……"
              />
            </label>

            <div class="rw-field rw-field--inline">
              <span>谁可见</span>
              <div class="rw-permissions">
                <label class="rw-perm">
                  <input v-model="form.permission" type="radio" value="self" />
                  <span>仅自己可见</span>
                </label>
                <label class="rw-perm">
                  <input v-model="form.permission" type="radio" value="residents" />
                  <span>原住民可见</span>
                </label>
              </div>
            </div>

            <p v-if="errorMessage" class="rw-error" role="alert">{{ errorMessage }}</p>
          </div>

          <footer class="rw-dialog__footer">
            <button type="button" class="rw-button" @click="dialogOpen = false">
              取消
            </button>
            <button
              type="button"
              class="rw-button rw-button--primary"
              :disabled="busy"
              @click="submit"
            >
              {{ busy ? '保存中' : '保存' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.rw-panel {
  display: grid;
  gap: 16px;
}

.rw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rw-head__meta {
  display: grid;
  gap: 2px;
}

.rw-head__meta strong {
  font-size: 16px;
}

.rw-head__meta span {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.rw-add {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}

.rw-empty {
  padding: 28px;
  text-align: center;
  color: rgba(29, 29, 31, 0.5);
  border: 1px dashed rgba(29, 29, 31, 0.14);
  border-radius: 12px;
  font-size: 13px;
}

.rw-list {
  display: grid;
  gap: 10px;
}

.rw-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
}

.rw-card__media {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(29, 29, 31, 0.06);
  display: grid;
  place-items: center;
}

.rw-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rw-card__ph {
  color: rgba(29, 29, 31, 0.4);
  font-size: 12px;
}

.rw-card__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.rw-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rw-card__title strong {
  font-size: 15px;
}

.rw-card__body {
  margin: 0;
  color: rgba(29, 29, 31, 0.8);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.rw-card__time {
  color: rgba(29, 29, 31, 0.42);
  font-size: 12px;
}

.rw-card__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.rw-mini {
  padding: 5px 10px;
  border: 1px solid rgba(29, 29, 31, 0.14);
  border-radius: 6px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  cursor: pointer;
  font-size: 12px;
}

.rw-mini--danger {
  color: var(--vu-danger, #e0483b);
  border-color: rgba(242, 166, 160, 0.3);
}

.rw-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.rw-badge--self {
  background: rgba(29, 29, 31, 0.1);
  color: rgba(29, 29, 31, 0.6);
}

.rw-badge--residents {
  background: rgba(47, 168, 79, 0.14);
  color: var(--vu-accent-dark, #258a41);
}

.rw-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.4);
}

.rw-dialog {
  width: min(480px, 100%);
  max-height: 90vh;
  overflow: auto;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(29, 29, 31, 0.12);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.rw-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(29, 29, 31, 0.08);
}

.rw-dialog__header h3 {
  margin: 0;
  font-size: 16px;
}

.rw-close {
  border: none;
  background: transparent;
  color: rgba(29, 29, 31, 0.7);
  cursor: pointer;
  font-size: 16px;
}

.rw-dialog__body {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.rw-field {
  display: grid;
  gap: 6px;
}

.rw-field > span {
  color: rgba(29, 29, 31, 0.65);
  font-size: 13px;
}

.rw-field input[type='text'],
.rw-field input[type='file'],
.rw-field textarea {
  padding: 10px 12px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.rw-preview {
  margin-top: 8px;
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid rgba(29, 29, 31, 0.08);
}

.rw-field--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rw-permissions {
  display: flex;
  gap: 12px;
}

.rw-perm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(29, 29, 31, 0.8);
  font-size: 13px;
  cursor: pointer;
}

.rw-error {
  margin: 0;
  color: var(--vu-danger, #e0483b);
  font-size: 13px;
}

.rw-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.rw-button {
  padding: 9px 18px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  cursor: pointer;
}

.rw-button--primary {
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  border-color: transparent;
  font-weight: 600;
}

.rw-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
