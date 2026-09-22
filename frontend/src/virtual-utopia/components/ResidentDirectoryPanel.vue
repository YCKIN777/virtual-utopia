<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { scenes } from '../data/scenes.js';
import { seedResidents } from '../data/residents.js';
import { worldStore } from '../stores/worldStore.js';

const emit = defineEmits(['open-profile', 'group-created']);

const router = useRouter();
const GROUP_MAX_MEMBERS = 8;

const tab = ref('residents'); // residents | scenes

const directory = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const myUserId = computed(() => worldStore.state.user?.phase5UserId);

const identityLabel = (resident) =>
  seedResidents.some((r) => r.residentName === resident.displayName) ? 'AI 居民' : '真人';

const oneLineIntro = (resident) =>
  resident.selfIntro || resident.occupation || resident.hobbies || '这位居民还没有写下简介';

// 已到访场景：用「已解锁场景」近似（后端无访问记录接口）
const visitedScenes = computed(() => scenes.filter((scene) => worldStore.isSceneUnlocked(scene.id)));

const openScene = (scene) => {
  router.push({ name: 'scene-detail', params: { sceneId: scene.id } });
};

const load = async () => {
  loading.value = true;
  errorMessage.value = '';
  const res = await worldStore.listResidentDirectory();
  loading.value = false;
  if (res.ok) {
    directory.value = res.residents;
  } else {
    errorMessage.value = res.error || '加载名录失败';
  }
};

// ---- 多选 ----
const selectedMembers = ref([]);
const isSelf = (resident) => resident.userId === myUserId.value;

// 阶段十：名录内直接标记好友（复用既有好友接口，仅新增交互）
const isFriend = (resident) =>
  (worldStore.state.friends || []).some(
    (friend) => String(friend.userId ?? friend.id) === String(resident.userId),
  );

const markFriend = async (resident) => {
  if (isFriend(resident)) {
    worldStore.notify('你们已经是好友了', 'info');
    return;
  }
  const result = await worldStore.sendFriendRequest({
    toUserId: resident.userId,
    toUsername: resident.username,
    toDisplayName: resident.displayName || resident.username,
  });
  if (result?.ok) {
    await worldStore.loadFriends();
  }
};
const isSelected = (resident) => selectedMembers.value.includes(resident.userId);

const toggleSelect = (resident) => {
  if (isSelf(resident)) return;
  if (isSelected(resident)) {
    selectedMembers.value = selectedMembers.value.filter((id) => id !== resident.userId);
  } else if (selectedMembers.value.length + 1 < GROUP_MAX_MEMBERS) {
    selectedMembers.value = [...selectedMembers.value, resident.userId];
  }
};

const canCreateGroup = computed(() => selectedMembers.value.length >= 2);

// ---- 建群确认 ----
const createOpen = ref(false);
const newGroupName = ref('');
const createError = ref('');
const createBusy = ref(false);

const openCreateGroup = () => {
  newGroupName.value = '';
  createError.value = '';
  createOpen.value = true;
};

const submitCreateGroup = async () => {
  const name = newGroupName.value.trim();
  if (!name) {
    createError.value = '请填写群名称';
    return;
  }
  if (selectedMembers.value.length < 2) {
    createError.value = '请至少选择 2 位居民';
    return;
  }
  createBusy.value = true;
  createError.value = '';
  const res = await worldStore.createGroup({ name, memberIds: selectedMembers.value });
  createBusy.value = false;
  if (!res.ok) {
    createError.value = res.error || '建群失败';
    return;
  }
  createOpen.value = false;
  const created = res.group || { id: `grp-${Date.now()}`, name, creatorUserId: myUserId.value };
  selectedMembers.value = [];
  emit('group-created', created);
};

// ---- 私聊 ----
const dm = reactive({ open: false, peer: null, messages: [], input: '', error: '' });
const dmBusy = ref(false);
let pollTimer = null;

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const startPolling = (fn) => {
  stopPolling();
  pollTimer = setInterval(fn, 3000);
};
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const refreshDm = async () => {
  if (!dm.peer) return;
  const res = await worldStore.listDirectMessages(dm.peer.userId);
  if (res.ok) dm.messages = res.messages;
};
const openDm = async (resident) => {
  dm.peer = resident;
  dm.input = '';
  dm.error = '';
  dm.open = true;
  await refreshDm();
  startPolling(refreshDm);
};
const closeDm = () => {
  dm.open = false;
  dm.peer = null;
  dm.messages = [];
  stopPolling();
};
const sendDm = async () => {
  const content = dm.input.trim();
  if (!content) return;
  dmBusy.value = true;
  dm.error = '';
  const res = await worldStore.sendDirectMessage({ toUserId: dm.peer.userId, content });
  dmBusy.value = false;
  if (!res.ok) {
    dm.error = res.error || '发送失败';
    return;
  }
  dm.input = '';
  await refreshDm();
};

onMounted(load);
onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="s3-panel">
    <div class="s3-tabs" role="tablist">
      <button
        type="button"
        class="s3-tab"
        :class="{ 's3-tab--active': tab === 'residents' }"
        @click="tab = 'residents'"
      >
        居民名录
      </button>
      <button
        type="button"
        class="s3-tab"
        :class="{ 's3-tab--active': tab === 'scenes' }"
        @click="tab = 'scenes'"
      >
        已到访场景
      </button>
    </div>

    <!-- 居民名录 -->
    <template v-if="tab === 'residents'">
      <div class="s3-head">
        <div>
          <strong>原住民名录</strong>
          <span>共 {{ directory.length }} 户 · 点击卡片查看对方主页 · 勾选≥2人可建临时项目群</span>
        </div>
      </div>

      <p v-if="errorMessage" class="s3-error">{{ errorMessage }}</p>
      <div v-if="loading" class="s3-empty">正在加载名录……</div>
      <div v-else-if="!directory.length" class="s3-empty">暂无原住民</div>

      <div v-else class="s3-directory">
        <div
          v-for="resident in directory"
          :key="resident.userId"
          class="s3-card"
          :class="{ 's3-card--self': isSelf(resident), 's3-card--picked': isSelected(resident) }"
          role="button"
          tabindex="0"
          @click="emit('open-profile', resident)"
          @keydown.enter="emit('open-profile', resident)"
        >
          <div class="s3-card__top">
            <span class="s3-avatar" aria-hidden="true">
              {{ (resident.displayName || resident.username).slice(0, 1) }}
            </span>
            <div class="s3-card__id">
              <strong>{{ resident.displayName || resident.username }}</strong>
              <span
                class="s3-tag"
                :class="identityLabel(resident) === 'AI 居民' ? 's3-tag--ai' : 's3-tag--human'"
              >
                {{ identityLabel(resident) }}
              </span>
            </div>
            <label
              class="s3-check"
              :title="isSelf(resident) ? '不能选择自己' : '勾选后可创建临时项目群'"
              @click.stop
            >
              <input
                type="checkbox"
                :checked="isSelected(resident)"
                :disabled="isSelf(resident)"
                @change="toggleSelect(resident)"
              />
            </label>
          </div>
          <p class="s3-card__intro">{{ oneLineIntro(resident) }}</p>
          <div class="s3-card__foot">
            <small>@{{ resident.username }} · {{ resident.homePlotId || '未分配' }}</small>
            <button
              v-if="!isSelf(resident)"
              type="button"
              class="s3-mini"
              @click.stop="markFriend(resident)"
            >
              {{ isFriend(resident) ? '已加好友' : '加好友' }}
            </button>
            <button
              v-if="!isSelf(resident)"
              type="button"
              class="s3-mini"
              @click.stop="openDm(resident)"
            >
              私聊
            </button>
          </div>
        </div>
      </div>

      <!-- 底部：勾选≥2人后出现 -->
      <div v-if="canCreateGroup" class="s3-bottom">
        <span>已选 {{ selectedMembers.length }} 位居民</span>
        <button type="button" class="s3-btn s3-btn--primary" @click="openCreateGroup">
          创建临时项目群
        </button>
      </div>
    </template>

    <!-- 已到访场景 -->
    <template v-else>
      <div class="s3-head">
        <div>
          <strong>已到访场景</strong>
          <span>你去过的 3D 场景（当前按已解锁场景展示）· 点击卡片前往</span>
        </div>
      </div>

      <div v-if="!visitedScenes.length" class="s3-empty">
        还没有到访过任何场景，去世界里走走吧
      </div>
      <div v-else class="s3-scenes">
        <button
          v-for="scene in visitedScenes"
          :key="scene.id"
          type="button"
          class="s3-scene"
          @click="openScene(scene)"
        >
          <span class="s3-scene__mark" :style="{ background: scene.accent }" aria-hidden="true">
            {{ scene.name.slice(0, 1) }}
          </span>
          <span class="s3-scene__info">
            <strong>{{ scene.name }}</strong>
            <small>{{ scene.category }}</small>
            <small class="s3-scene__summary">{{ scene.summary }}</small>
          </span>
        </button>
      </div>
    </template>

    <!-- 建群确认框（z-index 高于名录弹窗） -->
    <Teleport to="body">
      <div v-if="createOpen" class="s3-dialog-backdrop s3-dialog-backdrop--top" @mousedown.self="createOpen = false">
        <section class="s3-dialog" role="dialog" aria-modal="true">
          <header class="s3-dialog__header">
            <h3>创建临时项目群</h3>
            <button type="button" class="s3-close" @click="createOpen = false">✕</button>
          </header>
          <div class="s3-dialog__body">
            <label class="s3-field">
              <span>群名称</span>
              <input v-model="newGroupName" type="text" maxlength="40" placeholder="给群起个名字" />
            </label>
            <div class="s3-field">
              <span>已选成员（{{ selectedMembers.length }}）</span>
              <div class="s3-chips">
                <span v-for="id in selectedMembers" :key="id" class="s3-chip">
                  {{ (directory.find((r) => r.userId === id)?.displayName) || id }}
                </span>
              </div>
            </div>
            <p v-if="createError" class="s3-error">{{ createError }}</p>
          </div>
          <footer class="s3-dialog__footer">
            <button type="button" class="s3-btn" @click="createOpen = false">取消</button>
            <button type="button" class="s3-btn s3-btn--primary" :disabled="createBusy" @click="submitCreateGroup">
              {{ createBusy ? '创建中' : '确认建群' }}
            </button>
          </footer>
        </section>
      </div>

      <!-- 私聊弹窗（z-index 高于名录弹窗） -->
      <div v-if="dm.open" class="s3-dialog-backdrop s3-dialog-backdrop--top" @mousedown.self="closeDm">
        <section class="s3-dialog" role="dialog" aria-modal="true">
          <header class="s3-dialog__header">
            <h3>与 {{ dm.peer?.displayName || dm.peer?.username }} 私聊</h3>
            <button type="button" class="s3-close" @click="closeDm">✕</button>
          </header>
          <div class="s3-messages">
            <div v-if="!dm.messages.length" class="s3-empty">还没有消息，打个招呼吧</div>
            <div
              v-for="msg in dm.messages"
              :key="msg.id"
              class="s3-msg"
              :class="{ 's3-msg--mine': msg.fromUserId === myUserId }"
            >
              <span class="s3-msg__content">{{ msg.content }}</span>
              <small class="s3-msg__time">{{ formatDate(msg.createdAt) }}</small>
            </div>
          </div>
          <footer class="s3-composer">
            <textarea v-model="dm.input" rows="2" maxlength="300" placeholder="输入消息……" />
            <div class="s3-composer__row">
              <span v-if="dm.error" class="s3-error">{{ dm.error }}</span>
              <button type="button" class="s3-btn s3-btn--primary" :disabled="dmBusy" @click="sendDm">
                {{ dmBusy ? '发送中' : '发送' }}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.s3-panel {
  display: grid;
  gap: 16px;
}

.s3-tabs {
  display: flex;
  gap: 8px;
}

.s3-tab {
  padding: 7px 16px;
  border: 1px solid rgba(29, 29, 31, 0.14);
  border-radius: 999px;
  background: var(--vu-muted-surface, #f1f1f4);
  color: rgba(29, 29, 31, 0.7);
  font-size: 13px;
  cursor: pointer;
}

.s3-tab--active {
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  border-color: transparent;
  font-weight: 600;
}

.s3-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.s3-head > div {
  display: grid;
  gap: 2px;
}

.s3-head strong {
  font-size: 16px;
}

.s3-head span {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.s3-directory {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.s3-card {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  color: #1d1d1f;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.s3-card:hover {
  border-color: rgba(47, 168, 79, 0.5);
  background: rgba(47, 168, 79, 0.06);
}

.s3-card--picked {
  border-color: var(--vu-accent, #2fa84f);
  background: rgba(47, 168, 79, 0.1);
}

.s3-card--self {
  opacity: 0.6;
}

.s3-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.s3-avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(47, 168, 79, 0.14);
  color: var(--vu-accent-dark, #258a41);
  font-weight: 600;
  flex-shrink: 0;
}

.s3-card__id {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.s3-card__id strong {
  font-size: 14px;
}

.s3-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.s3-tag--ai {
  background: rgba(47, 168, 79, 0.14);
  color: var(--vu-accent-dark, #258a41);
}

.s3-tag--human {
  background: rgba(29, 29, 31, 0.08);
  color: rgba(29, 29, 31, 0.6);
}

.s3-check {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.s3-card__intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(29, 29, 31, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.s3-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.s3-card__foot small {
  color: rgba(29, 29, 31, 0.5);
  font-size: 12px;
}

.s3-mini {
  padding: 4px 12px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 999px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  font-size: 12px;
  cursor: pointer;
}

.s3-mini:hover {
  border-color: var(--vu-accent, #2fa84f);
  color: var(--vu-accent-dark, #258a41);
}

/* 底部建群条 */
.s3-bottom {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(47, 168, 79, 0.35);
  border-radius: 12px;
  background: rgba(47, 168, 79, 0.08);
  font-size: 13px;
  color: rgba(29, 29, 31, 0.75);
}

/* 场景列表 */
.s3-scenes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.s3-scene {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  color: #1d1d1f;
  cursor: pointer;
  text-align: left;
}

.s3-scene:hover {
  border-color: rgba(47, 168, 79, 0.5);
  background: rgba(47, 168, 79, 0.06);
}

.s3-scene__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #ffffff;
  font-weight: 600;
  flex-shrink: 0;
}

.s3-scene__info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.s3-scene__info strong {
  font-size: 14px;
}

.s3-scene__info small {
  color: rgba(29, 29, 31, 0.5);
  font-size: 12px;
}

.s3-scene__summary {
  color: rgba(29, 29, 31, 0.7) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.s3-empty {
  padding: 24px;
  text-align: center;
  color: rgba(29, 29, 31, 0.5);
  border: 1px dashed rgba(29, 29, 31, 0.14);
  border-radius: 12px;
  font-size: 13px;
}

.s3-error {
  color: var(--vu-danger, #e0483b);
  font-size: 13px;
  margin: 0;
}

.s3-btn {
  padding: 8px 16px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: transparent;
  color: rgba(29, 29, 31, 0.8);
  cursor: pointer;
}

.s3-btn--primary {
  background: var(--vu-accent, #2fa84f);
  color: #ffffff;
  border-color: transparent;
  font-weight: 600;
}

.s3-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.s3-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.4);
}

.s3-dialog-backdrop--top {
  z-index: 1100;
}

.s3-dialog {
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  max-height: 86vh;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(29, 29, 31, 0.12);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.s3-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(29, 29, 31, 0.08);
}

.s3-dialog__header h3 {
  margin: 0;
  font-size: 16px;
  flex: 1;
}

.s3-close {
  border: none;
  background: transparent;
  color: rgba(29, 29, 31, 0.7);
  cursor: pointer;
  font-size: 16px;
}

.s3-dialog__body {
  display: grid;
  gap: 14px;
  padding: 18px;
  overflow: auto;
}

.s3-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.s3-field {
  display: grid;
  gap: 6px;
}

.s3-field > span {
  color: rgba(29, 29, 31, 0.65);
  font-size: 13px;
}

.s3-field input {
  padding: 10px 12px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 14px;
}

.s3-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.s3-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(47, 168, 79, 0.12);
  color: var(--vu-accent-dark, #258a41);
  font-size: 12px;
}

.s3-messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  overflow: auto;
  min-height: 180px;
  max-height: 40vh;
}

.s3-msg {
  display: grid;
  gap: 2px;
  align-self: flex-start;
  max-width: 80%;
}

.s3-msg--mine {
  align-self: flex-end;
}

.s3-msg__content {
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.s3-msg--mine .s3-msg__content {
  background: rgba(47, 168, 79, 0.12);
}

.s3-msg__time {
  color: rgba(29, 29, 31, 0.4);
  font-size: 11px;
}

.s3-msg--mine .s3-msg__time {
  text-align: right;
}

.s3-composer {
  display: grid;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}

.s3-composer textarea {
  padding: 10px 12px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 8px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

.s3-composer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.s3-composer__row .s3-btn {
  margin-left: auto;
}
</style>
