<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { worldStore } from '../stores/worldStore.js';

const GROUP_MAX_MEMBERS = 8;

const directory = ref([]);
const groups = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const myUserId = computed(() => worldStore.state.user?.phase5UserId);

// 一对一私聊
const dm = reactive({
  open: false,
  peer: null,
  messages: [],
  input: '',
  error: '',
});
const dmBusy = ref(false);

// 群聊
const groupChat = reactive({
  open: false,
  group: null,
  members: [],
  messages: [],
  input: '',
  error: '',
});
const groupBusy = ref(false);

// 建群
const createOpen = ref(false);
const newGroupName = ref('');
const selectedMembers = ref([]);
const createError = ref('');
const createBusy = ref(false);

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

const load = async () => {
  loading.value = true;
  errorMessage.value = '';

  const [dirRes, groupsRes] = await Promise.all([
    worldStore.listResidentDirectory(),
    worldStore.listGroups(),
  ]);

  loading.value = false;

  if (dirRes.ok) {
    directory.value = dirRes.residents;
  } else {
    errorMessage.value = dirRes.error || '加载名录失败';
  }

  if (groupsRes.ok) {
    groups.value = groupsRes.groups;
  }
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

// ---- 私聊 ----
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

  const res = await worldStore.sendDirectMessage({
    toUserId: dm.peer.userId,
    content,
  });

  dmBusy.value = false;

  if (!res.ok) {
    dm.error = res.error || '发送失败';
    return;
  }

  dm.input = '';
  await refreshDm();
};

// ---- 群聊 ----
const refreshGroupChat = async () => {
  if (!groupChat.group) return;
  const res = await worldStore.listGroupMessages(groupChat.group.id);
  if (res.ok) {
    groupChat.messages = res.messages;
    groupChat.members = res.members;
  }
};

const openGroup = async (group) => {
  groupChat.group = group;
  groupChat.input = '';
  groupChat.error = '';
  groupChat.open = true;
  await refreshGroupChat();
  startPolling(refreshGroupChat);
};

const closeGroup = () => {
  groupChat.open = false;
  groupChat.group = null;
  groupChat.messages = [];
  groupChat.members = [];
  stopPolling();
};

const sendGroup = async () => {
  const content = groupChat.input.trim();
  if (!content) return;

  groupBusy.value = true;
  groupChat.error = '';

  const res = await worldStore.sendGroupMessage(groupChat.group.id, {
    content,
  });

  groupBusy.value = false;

  if (!res.ok) {
    groupChat.error = res.error || '发言失败';
    return;
  }

  groupChat.input = '';
  await refreshGroupChat();
};

// ---- 建群 ----
const openCreateGroup = () => {
  newGroupName.value = '';
  selectedMembers.value = [];
  createError.value = '';
  createOpen.value = true;
};

const toggleMember = (userId) => {
  if (selectedMembers.value.includes(userId)) {
    selectedMembers.value = selectedMembers.value.filter((id) => id !== userId);
  } else if (selectedMembers.value.length + 1 < GROUP_MAX_MEMBERS) {
    selectedMembers.value = [...selectedMembers.value, userId];
  }
};

const submitCreateGroup = async () => {
  const name = newGroupName.value.trim();
  if (!name) {
    createError.value = '请填写群名称';
    return;
  }

  if (!selectedMembers.value.length) {
    createError.value = '至少邀请一位原住民';
    return;
  }

  createBusy.value = true;
  createError.value = '';

  const res = await worldStore.createGroup({
    name,
    memberIds: selectedMembers.value,
  });

  createBusy.value = false;

  if (!res.ok) {
    createError.value = res.error || '建群失败';
    return;
  }

  createOpen.value = false;
  await load();
};

onMounted(load);
onBeforeUnmount(stopPolling);
</script>

<template>
  <section class="s3-panel">
    <div class="s3-head">
      <div>
        <strong>原住民名录</strong>
        <span>共 {{ directory.length }} 户 · 点击居民可发起私聊 · 无活跃度与排行</span>
      </div>
      <button type="button" class="s3-btn s3-btn--primary" @click="openCreateGroup">
        + 创建临时小群
      </button>
    </div>

    <p v-if="errorMessage" class="s3-error">{{ errorMessage }}</p>

    <div v-if="loading" class="s3-empty">正在加载名录……</div>

    <div v-else-if="!directory.length" class="s3-empty">暂无原住民</div>

    <div v-else class="s3-directory">
      <button
        v-for="resident in directory"
        :key="resident.userId"
        type="button"
        class="s3-resident"
        :class="{ 's3-resident--self': resident.userId === myUserId }"
        :disabled="resident.userId === myUserId"
        @click="openDm(resident)"
      >
        <span class="s3-avatar" aria-hidden="true">
          {{ (resident.displayName || resident.username).slice(0, 1) }}
        </span>
        <span class="s3-resident__info">
          <strong>{{ resident.displayName || resident.username }}</strong>
          <small>@{{ resident.username }} · {{ resident.homePlotId || '未分配' }}</small>
          <small v-if="resident.occupation" class="s3-resident__meta">职业：{{ resident.occupation }}</small>
          <small v-if="resident.hobbies" class="s3-resident__meta">爱好：{{ resident.hobbies }}</small>
          <small v-if="resident.selfIntro" class="s3-resident__meta">{{ resident.selfIntro }}</small>
        </span>
      </button>
    </div>

    <div v-if="groups.length" class="s3-groups">
      <div class="s3-groups__head">我的小群</div>
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="s3-group"
        @click="openGroup(group)"
      >
        <strong>{{ group.name }}</strong>
        <small>{{ group.members?.length || 0 }} 人</small>
      </button>
    </div>

    <!-- 私聊弹窗 -->
    <Teleport to="body">
      <div v-if="dm.open" class="s3-dialog-backdrop" @mousedown.self="closeDm">
        <section class="s3-dialog">
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

      <!-- 群聊弹窗 -->
      <div v-if="groupChat.open" class="s3-dialog-backdrop" @mousedown.self="closeGroup">
        <section class="s3-dialog">
          <header class="s3-dialog__header">
            <h3>{{ groupChat.group?.name }}</h3>
            <small class="s3-members">{{ groupChat.members.length }} 人</small>
            <button type="button" class="s3-close" @click="closeGroup">✕</button>
          </header>
          <div class="s3-messages">
            <div v-if="!groupChat.messages.length" class="s3-empty">群聊还没有消息</div>
            <div
              v-for="msg in groupChat.messages"
              :key="msg.id"
              class="s3-msg"
              :class="{ 's3-msg--mine': msg.fromUserId === myUserId }"
            >
              <strong class="s3-msg__author">{{ msg.fromUsername }}</strong>
              <span class="s3-msg__content">{{ msg.content }}</span>
              <small class="s3-msg__time">{{ formatDate(msg.createdAt) }}</small>
            </div>
          </div>
          <footer class="s3-composer">
            <textarea v-model="groupChat.input" rows="2" maxlength="300" placeholder="输入消息……" />
            <div class="s3-composer__row">
              <span v-if="groupChat.error" class="s3-error">{{ groupChat.error }}</span>
              <button type="button" class="s3-btn s3-btn--primary" :disabled="groupBusy" @click="sendGroup">
                {{ groupBusy ? '发送中' : '发送' }}
              </button>
            </div>
          </footer>
        </section>
      </div>

      <!-- 建群弹窗 -->
      <div v-if="createOpen" class="s3-dialog-backdrop" @mousedown.self="createOpen = false">
        <section class="s3-dialog">
          <header class="s3-dialog__header">
            <h3>创建临时小群</h3>
            <button type="button" class="s3-close" @click="createOpen = false">✕</button>
          </header>
          <div class="s3-dialog__body">
            <label class="s3-field">
              <span>群名称</span>
              <input v-model="newGroupName" type="text" maxlength="40" placeholder="给群起个名字" />
            </label>
            <div class="s3-field">
              <span>邀请原住民（最多 {{ GROUP_MAX_MEMBERS - 1 }} 人）</span>
              <div class="s3-pick-list">
                <label
                  v-for="resident in directory.filter((r) => r.userId !== myUserId)"
                  :key="resident.userId"
                  class="s3-pick"
                >
                  <input
                    type="checkbox"
                    :checked="selectedMembers.includes(resident.userId)"
                    @change="toggleMember(resident.userId)"
                  />
                  <span>
                    {{ resident.displayName || resident.username }}
                    <small>@{{ resident.username }}</small>
                  </span>
                </label>
              </div>
            </div>
            <p v-if="createError" class="s3-error">{{ createError }}</p>
          </div>
          <footer class="s3-dialog__footer">
            <button type="button" class="s3-btn" @click="createOpen = false">取消</button>
            <button type="button" class="s3-btn s3-btn--primary" :disabled="createBusy" @click="submitCreateGroup">
              {{ createBusy ? '创建中' : '创建' }}
            </button>
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
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.s3-resident {
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

.s3-resident--self {
  opacity: 0.5;
  cursor: default;
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

.s3-resident__info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.s3-resident__info strong {
  font-size: 14px;
}

.s3-resident__info small {
  color: rgba(29, 29, 31, 0.5);
  font-size: 12px;
}

.s3-resident__info .s3-resident__meta {
  color: rgba(29, 29, 31, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.s3-groups {
  display: grid;
  gap: 8px;
  padding-top: 6px;
}

.s3-groups__head {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.s3-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  color: #1d1d1f;
  cursor: pointer;
  text-align: left;
}

.s3-group strong {
  font-size: 14px;
}

.s3-group small {
  color: rgba(29, 29, 31, 0.5);
  font-size: 12px;
}

.s3-empty {
  padding: 22px;
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

.s3-dialog {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
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

.s3-members {
  color: rgba(29, 29, 31, 0.55);
  font-size: 12px;
}

.s3-close {
  border: none;
  background: transparent;
  color: rgba(29, 29, 31, 0.7);
  cursor: pointer;
  font-size: 16px;
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

.s3-msg__author {
  font-size: 12px;
  color: rgba(29, 29, 31, 0.6);
}

.s3-msg--mine .s3-msg__author {
  text-align: right;
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

.s3-pick-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}

.s3-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.s3-pick span {
  display: grid;
}

.s3-pick small {
  color: rgba(29, 29, 31, 0.5);
  font-size: 11px;
}
</style>
