<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import HomepageS2Panel from '../components/HomepageS2Panel.vue';
import ResidentCardsPanel from '../components/ResidentCardsPanel.vue';
import ResidentDirectoryPanel from '../components/ResidentDirectoryPanel.vue';
import ResidentWorksPanel from '../components/ResidentWorksPanel.vue';
import { seedResidents } from '../data/residents.js';
import { worldStore } from '../stores/worldStore.js';

const router = useRouter();

const user = computed(() => worldStore.state.user);
const nickname = computed(() => user.value?.displayName || '居民');
const myUserId = computed(() => user.value?.phase5UserId);
const identityLabel = computed(() => {
  if (!user.value) return '';
  const isAI = seedResidents.some((r) => r.residentName === user.value.displayName);
  return isAI ? 'AI 居民' : '真人';
});

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

// ---- 链路1：主标签（本地状态切换，不改变路由，故保持滚动位置不跳顶） ----
const mainTab = ref('intro');

// ---- 中部折叠模块 ----
const middle = reactive({ collab: false, neighbor: false, collect: false });

// ---- 通用弹窗（单层，避免叠层错乱；子对话框 z-index 更高） ----
const MODAL_TITLES = {
  plaza: '广场消息通知',
  groups: '我的临时群聊空间',
  wishboard: '邻里心愿看板',
  interaction: '邻里往来记录',
  visitors: '宅院访客记录',
  favorites: '个人风物收藏',
  guestbook: '邻里留言簿',
  directory: '原住民名录',
  password: '修改密码',
};
const EMPTY_TEXT = {
  plaza: '暂无 @ 你或回复你的广场消息',
  interaction: '暂无邻里往来记录',
  visitors: '暂无宅院访客记录',
};
const activeModal = ref('');
const modalTitle = computed(() => MODAL_TITLES[activeModal.value] || '');

const openModal = (key) => {
  activeModal.value = key;
  if (key === 'groups') loadGroups();
};
const closeModal = () => {
  activeModal.value = '';
  closeGroupChat();
};

// ---- 链路2：广场消息通知（UI 外壳 + 空状态；红点绑定未读数，待后端接入） ----
const plaza = reactive({ unread: 0, items: [] });
const plazaHasUnread = computed(() => plaza.unread > 0);
const gotoPlazaPost = (item) => {
  // 后端无“帖子定位”接口且本轮禁止改 3D；此处跳转到生活广场场景详情作为安全落点
  activeModal.value = '';
  router.push({ name: 'scene-detail', params: { sceneId: item?.sceneId || 'yard' } });
};

// ---- 链路3：临时群聊空间 ----
const groups = ref([]);
const groupsBusy = ref(false);
const groupMeta = reactive({}); // groupId -> { members, last }

const loadGroups = async () => {
  groupsBusy.value = true;
  const res = await worldStore.listGroups();
  groupsBusy.value = false;
  if (!res.ok) return;
  groups.value = res.groups || [];
  await Promise.all(
    groups.value.map(async (g) => {
      const r = await worldStore.listGroupMessages(g.id);
      if (r.ok) {
        const msgs = r.messages || [];
        groupMeta[g.id] = {
          members: r.members || [],
          last: msgs.length ? msgs[msgs.length - 1] : null,
        };
      }
    }),
  );
};

const groupInitials = (g) => {
  const members = groupMeta[g.id]?.members || [];
  return members.slice(0, 3).map((m) => (m.username || '?').slice(0, 1));
};

const activeGroup = reactive({ group: null, members: [], messages: [], input: '', error: '', open: false });
let groupTimer = null;
const refreshGroup = async () => {
  if (!activeGroup.group) return;
  const res = await worldStore.listGroupMessages(activeGroup.group.id);
  if (res.ok) {
    activeGroup.messages = res.messages || [];
    activeGroup.members = res.members || [];
  }
};
const openGroup = async (group) => {
  activeModal.value = '';
  activeGroup.group = group;
  activeGroup.input = '';
  activeGroup.error = '';
  activeGroup.open = true;
  await refreshGroup();
  groupTimer = setInterval(refreshGroup, 3000);
};
const closeGroupChat = () => {
  activeGroup.open = false;
  activeGroup.group = null;
  activeGroup.messages = [];
  activeGroup.members = [];
  if (groupTimer) {
    clearInterval(groupTimer);
    groupTimer = null;
  }
};
const sendGroup = async () => {
  const text = activeGroup.input.trim();
  if (!text) return;
  const res = await worldStore.sendGroupMessage(activeGroup.group.id, { content: text });
  if (res.ok) {
    activeGroup.input = '';
    await refreshGroup();
  } else {
    activeGroup.error = res.error || '发送失败';
  }
};
const isGroupOwner = computed(
  () => Boolean(activeGroup.group) && activeGroup.group.creatorUserId === myUserId.value,
);
const dissolveGroup = () => {
  worldStore.notify('「解散群」待后端开放，本期为占位入口', 'info');
};

// 建群成功（来自名录弹窗）→ 关闭名录并打开新群聊
const onGroupCreated = (group) => {
  activeModal.value = '';
  openGroup(group);
};

// 点击名录居民卡片 → 跳对方主页
const openResidentProfile = (resident) => {
  activeModal.value = '';
  router.push({ name: 'resident-profile', params: { username: resident.username } });
};

// ---- 修改密码 ----
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' });
const passwordErrors = reactive({ currentPassword: '', newPassword: '', confirmPassword: '', submit: '' });
const passwordBusy = ref(false);
const passwordDone = ref(false);
const submitPasswordChange = async () => {
  passwordErrors.currentPassword = '';
  passwordErrors.newPassword = '';
  passwordErrors.confirmPassword = '';
  passwordErrors.submit = '';
  passwordDone.value = false;
  if (!passwordForm.currentPassword) passwordErrors.currentPassword = '请输入当前密码';
  if (!passwordForm.newPassword) passwordErrors.newPassword = '请输入新密码';
  else if (passwordForm.newPassword.length < 6) passwordErrors.newPassword = '新密码至少需要 6 个字符';
  if (passwordForm.confirmPassword !== passwordForm.newPassword) passwordErrors.confirmPassword = '两次输入的新密码不一致';
  if (passwordErrors.currentPassword || passwordErrors.newPassword || passwordErrors.confirmPassword) return;
  passwordBusy.value = true;
  const result = await worldStore.changePassword({
    currentPassword: passwordForm.currentPassword,
    newPassword: passwordForm.newPassword,
  });
  passwordBusy.value = false;
  if (!result.ok) {
    passwordErrors.submit = result.error || '修改密码失败';
    return;
  }
  passwordForm.currentPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordDone.value = true;
};

// ---- 身份与权限（阶段三） ----
// role: 'viewer' = 已登录访客；'editor'/'admin' = 原住民；未登录 = 游客
const role = computed(() => worldStore.state.permissions?.role || 'viewer');
const isVisitor = computed(() => role.value === 'viewer');
// 访客仅可见「简介」，作品/备忘/消息与协作/邻里往来/个人收藏全部隐藏（不渲染 DOM）
const canSeePrivate = computed(() => !isVisitor.value);

// ---- 简介可见权限（本机持久化；本机即时生效） ----
const INTRO_PERM_KEY = computed(() => `vu:intro-perm:${user.value?.username || 'guest'}`);
const introVisibility = ref('residents');
const INTRO_PERM_LABEL = { residents: '原住民可见', self: '仅自己可见' };
const loadIntroPerm = () => {
  if (!user.value) return;
  try {
    const stored = localStorage.getItem(INTRO_PERM_KEY.value);
    introVisibility.value = stored === 'self' ? 'self' : 'residents';
  } catch {
    introVisibility.value = 'residents';
  }
};
watch(introVisibility, (value) => {
  if (!user.value) return;
  try {
    localStorage.setItem(INTRO_PERM_KEY.value, value);
  } catch {
    /* 忽略存储异常 */
  }
  worldStore.notify(`「简介」可见权限已更新为：${INTRO_PERM_LABEL[value]}`, 'success');
});
watch(user, loadIntroPerm, { immediate: true });
// 访客不可见私密模块 → 回到简介标签
watch(canSeePrivate, (ok) => {
  if (!ok) mainTab.value = 'intro';
});


// ---- 邻里心愿看板：公开 wish_list 卡片 ----
const wishItems = computed(() =>
  (worldStore.state.residentCards.community || []).filter((c) => c.cardType === 'wish_list'),
);

// ---- 链路5：弹窗打开时锁定背景滚动 ----
const anyOverlayOpen = computed(() => Boolean(activeModal.value) || activeGroup.open);
watch(anyOverlayOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});

onMounted(() => {
  worldStore.loadResidentCards();
});
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  if (groupTimer) {
    clearInterval(groupTimer);
    groupTimer = null;
  }
});
</script>

<template>
  <main v-if="user" class="vu-page vu-profile">
    <div class="vu-container">
      <!-- 顶部：头像 + 昵称 + 身份标签，无功能按钮 -->
      <header class="vu-topbar">
        <div class="vu-avatar" aria-hidden="true">{{ user.displayName.slice(0, 1) }}</div>
        <div class="vu-topbar__info">
          <h1 class="vu-topbar__name">{{ user.displayName }}</h1>
          <div class="vu-topbar__meta">
            <span class="vu-tag" :class="identityLabel === 'AI 居民' ? 'vu-tag--ai' : 'vu-tag--human'">
              {{ identityLabel }}
            </span>
            <span class="vu-at">@{{ user.username }}</span>
          </div>
        </div>
      </header>

      <!-- 主视觉大卡片：动态标题 + 3 动态标签 -->
      <section class="vu-maincard">
        <h2 class="vu-maincard__title">{{ nickname }}的简介与作品</h2>
        <nav class="vu-maintabs" aria-label="主页分区">
          <button
            type="button"
            class="vu-maintab"
            :class="{ 'vu-maintab--active': mainTab === 'intro' }"
            @click="mainTab = 'intro'"
          >
            {{ nickname }}·简介
          </button>
          <button
            v-if="canSeePrivate"
            type="button"
            class="vu-maintab"
            :class="{ 'vu-maintab--active': mainTab === 'works' }"
            @click="mainTab = 'works'"
          >
            {{ nickname }}·作品
          </button>
          <button
            v-if="canSeePrivate"
            type="button"
            class="vu-maintab"
            :class="{ 'vu-maintab--active': mainTab === 'memo' }"
            @click="mainTab = 'memo'"
          >
            {{ nickname }}·备忘
          </button>
        </nav>

        <div class="vu-maintab__body">
          <Transition name="vu-fade" mode="out-in">
            <!-- 简介 -->
            <div v-if="mainTab === 'intro'" key="intro" class="vu-intro">
              <p class="vu-intro__text">{{ user.selfIntro || '（暂无简介）' }}</p>
              <div class="vu-intro__perm">
                <span class="vu-intro__perm-label">可见权限</span>
                <select v-model="introVisibility" class="vu-select">
                  <option value="self">仅自己</option>
                  <option value="residents">原住民可见</option>
                </select>
                <small class="vu-intro__hint">更改后即时生效 · 无需刷新</small>
              </div>
            </div>

            <!-- 作品：独立上传模块，与备忘子项完全隔离 -->
            <div v-else-if="mainTab === 'works'" key="works">
              <ResidentWorksPanel />
            </div>

            <!-- 备忘：仅内部展示 4 个子项，外层不重复 -->
            <div v-else-if="mainTab === 'memo'" key="memo">
              <ResidentCardsPanel :filter-types="['work_plan', 'travel_log', 'life_note', 'wish_list']" />
            </div>
          </Transition>
        </div>
      </section>

      <!-- 中部折叠面板组：3 大模块，默认全部收起（访客不渲染） -->
      <section v-if="canSeePrivate" class="vu-modules">
        <!-- ① 消息与协作 -->
        <div class="vu-module">
          <button type="button" class="vu-module__head" :aria-expanded="middle.collab" @click="middle.collab = !middle.collab">
            <span class="vu-module__title">消息与协作</span>
            <span class="vu-chev" :class="{ open: middle.collab }">▾</span>
          </button>
          <div v-show="middle.collab" class="vu-rows">
            <button type="button" class="vu-row" @click="openModal('plaza')">
              <span class="vu-row__label">
                广场消息通知
                <span v-if="plazaHasUnread" class="vu-dot" aria-label="有未读" />
              </span>
              <span class="vu-row__chev">›</span>
            </button>
            <button type="button" class="vu-row" @click="openModal('groups')">
              <span>我的临时群聊空间</span><span class="vu-row__chev">›</span>
            </button>
          </div>
        </div>

        <!-- ② 邻里往来 -->
        <div class="vu-module">
          <button type="button" class="vu-module__head" :aria-expanded="middle.neighbor" @click="middle.neighbor = !middle.neighbor">
            <span class="vu-module__title">邻里往来</span>
            <span class="vu-chev" :class="{ open: middle.neighbor }">▾</span>
          </button>
          <div v-show="middle.neighbor" class="vu-rows">
            <button type="button" class="vu-row" @click="openModal('wishboard')">
              <span>邻里心愿看板</span><span class="vu-row__chev">›</span>
            </button>
            <button type="button" class="vu-row" @click="openModal('interaction')">
              <span>邻里往来记录</span><span class="vu-row__chev">›</span>
            </button>
            <button type="button" class="vu-row" @click="openModal('visitors')">
              <span>宅院访客记录</span><span class="vu-row__chev">›</span>
            </button>
          </div>
        </div>

        <!-- ③ 个人收藏 -->
        <div class="vu-module">
          <button type="button" class="vu-module__head" :aria-expanded="middle.collect" @click="middle.collect = !middle.collect">
            <span class="vu-module__title">个人收藏</span>
            <span class="vu-chev" :class="{ open: middle.collect }">▾</span>
          </button>
          <div v-show="middle.collect" class="vu-rows">
            <button type="button" class="vu-row" @click="openModal('favorites')">
              <span>个人风物收藏</span><span class="vu-row__chev">›</span>
            </button>
            <button type="button" class="vu-row" @click="openModal('guestbook')">
              <span>邻里留言簿</span><span class="vu-row__chev">›</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 底部：2 个纯图标按钮，点击唤起弹窗 -->
      <nav class="vu-bottombar" aria-label="快捷入口">
        <button type="button" class="vu-iconbtn" title="原住民名录" aria-label="原住民名录" @click="openModal('directory')">
          <span class="vu-iconbtn__icon" aria-hidden="true">👥</span>
        </button>
        <button type="button" class="vu-iconbtn" title="修改密码" aria-label="修改密码" @click="openModal('password')">
          <span class="vu-iconbtn__icon" aria-hidden="true">🔒</span>
        </button>
      </nav>
    </div>

    <!-- 通用弹窗（单层） -->
    <Teleport to="body">
      <div v-if="activeModal" class="vu-modal-backdrop" @mousedown.self="closeModal">
        <section class="vu-modal" :class="{ 'vu-modal--wide': activeModal === 'directory' }" role="dialog" aria-modal="true">
          <header class="vu-modal__header">
            <h3>{{ modalTitle }}</h3>
            <button type="button" class="vu-modal__close" aria-label="关闭" @click="closeModal">✕</button>
          </header>
          <div class="vu-modal__body">
            <!-- 名录弹窗 -->
            <template v-if="activeModal === 'directory'">
              <ResidentDirectoryPanel @open-profile="openResidentProfile" @group-created="onGroupCreated" />
            </template>

            <!-- 修改密码 -->
            <template v-else-if="activeModal === 'password'">
              <form class="vu-pwform" novalidate @submit.prevent="submitPasswordChange">
                <label class="vu-field">
                  <span>当前密码</span>
                  <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" :disabled="passwordBusy" />
                  <small v-if="passwordErrors.currentPassword" class="vu-field__error">{{ passwordErrors.currentPassword }}</small>
                </label>
                <label class="vu-field">
                  <span>新密码</span>
                  <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" :disabled="passwordBusy" />
                  <small v-if="passwordErrors.newPassword" class="vu-field__error">{{ passwordErrors.newPassword }}</small>
                </label>
                <label class="vu-field">
                  <span>确认新密码</span>
                  <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" :disabled="passwordBusy" />
                  <small v-if="passwordErrors.confirmPassword" class="vu-field__error">{{ passwordErrors.confirmPassword }}</small>
                </label>
                <p v-if="passwordErrors.submit" class="vu-error" role="alert">{{ passwordErrors.submit }}</p>
                <p v-if="passwordDone" class="vu-done" role="status">密码修改成功</p>
                <button type="submit" class="vu-btn vu-btn--primary" :disabled="passwordBusy">
                  {{ passwordBusy ? '保存中' : '保存新密码' }}
                </button>
              </form>
            </template>

            <!-- 个人收藏 -->
            <template v-else-if="activeModal === 'favorites'">
              <ResidentCardsPanel :filter-types="['favorite']" />
            </template>

            <!-- 留言簿 -->
            <template v-else-if="activeModal === 'guestbook'">
              <HomepageS2Panel />
            </template>

            <!-- 邻里心愿看板 -->
            <template v-else-if="activeModal === 'wishboard'">
              <div v-if="!wishItems.length" class="vu-empty">暂无邻里心愿</div>
              <div v-else class="vu-wishlist">
                <article v-for="item in wishItems" :key="item.id" class="vu-wish">
                  <div class="vu-wish__head">
                    <strong>{{ item.content?.title || '（无标题）' }}</strong>
                    <span class="vu-wish__author">@{{ item.username }}</span>
                  </div>
                  <p v-if="item.content?.body" class="vu-wish__body">{{ item.content.body }}</p>
                </article>
              </div>
            </template>

            <!-- 广场消息通知：UI 外壳 + 空状态（数据待后端接入） -->
            <template v-else-if="activeModal === 'plaza'">
              <div v-if="!plaza.items.length" class="vu-empty">{{ EMPTY_TEXT.plaza }}</div>
              <div v-else class="vu-msglist">
                <button
                  v-for="item in plaza.items"
                  :key="item.id"
                  type="button"
                  class="vu-msgitem"
                  @click="gotoPlazaPost(item)"
                >
                  <span class="vu-msgitem__head">
                    <strong>{{ item.fromName || item.fromUsername || '邻居' }}</strong>
                    <small>{{ formatDate(item.createdAt) }}</small>
                  </span>
                  <span class="vu-msgitem__summary">{{ item.summary || item.content }}</span>
                </button>
              </div>
            </template>

            <!-- 我的临时群聊空间 -->
            <template v-else-if="activeModal === 'groups'">
              <div v-if="groupsBusy" class="vu-empty">加载中…</div>
              <div v-else-if="!groups.length" class="vu-empty">你还没有加入或创建临时群</div>
              <div v-else class="vu-grouplist">
                <button v-for="g in groups" :key="g.id" type="button" class="vu-group" @click="openGroup(g)">
                  <span class="vu-group__avatars" aria-hidden="true">
                    <span v-for="(ch, i) in groupInitials(g)" :key="i" class="vu-group__avatar">{{ ch }}</span>
                  </span>
                  <span class="vu-group__main">
                    <strong>{{ g.name }}</strong>
                    <small class="vu-group__preview">
                      {{ groupMeta[g.id]?.last ? groupMeta[g.id].last.content : '暂无消息' }}
                    </small>
                  </span>
                  <span class="vu-group__side">
                    <small>{{ (groupMeta[g.id]?.members || []).length }} 人</small>
                  </span>
                </button>
              </div>
            </template>

            <!-- 其余无后端模块：空状态 -->
            <template v-else>
              <p class="vu-empty">{{ EMPTY_TEXT[activeModal] || '暂无内容' }}</p>
            </template>
          </div>
        </section>
      </div>

      <!-- 群聊覆盖窗 -->
      <div v-if="activeGroup.open" class="vu-modal-backdrop vu-modal-backdrop--top" @mousedown.self="closeGroupChat">
        <section class="vu-modal vu-modal--chat" role="dialog" aria-modal="true">
          <header class="vu-modal__header">
            <h3>{{ activeGroup.group?.name }}</h3>
            <small class="vu-modal__members">{{ activeGroup.members.length }} 人</small>
            <button
              v-if="isGroupOwner"
              type="button"
              class="vu-dissolve"
              @click="dissolveGroup"
            >
              解散群
            </button>
            <button type="button" class="vu-modal__close" aria-label="关闭" @click="closeGroupChat">✕</button>
          </header>
          <div class="vu-chat">
            <div v-if="!activeGroup.messages.length" class="vu-empty">群聊还没有消息</div>
            <div
              v-for="m in activeGroup.messages"
              :key="m.id"
              class="vu-msg"
              :class="{ 'vu-msg--mine': m.fromUserId === myUserId }"
            >
              <strong class="vu-msg__author">{{ m.fromUsername }}</strong>
              <span class="vu-msg__content">{{ m.content }}</span>
            </div>
          </div>
          <footer class="vu-composer">
            <textarea v-model="activeGroup.input" rows="2" maxlength="300" placeholder="输入消息……" />
            <button type="button" class="vu-btn vu-btn--primary" :disabled="!activeGroup.input.trim()" @click="sendGroup">发送</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </main>

  <main v-else class="vu-profile-guest">
    <div class="vu-container">
      <span class="vu-kicker">PROFILE REQUIRED</span>
      <h1>登录后查看个人中心</h1>
      <p>登录后可从 Phase5 载入个人档案与家园快照。</p>
      <RouterLink :to="{ name: 'login', query: { redirect: '/profile' } }" class="vu-btn vu-btn--primary">
        前往登录
      </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.vu-profile {
  background: var(--vu-paper, #fbfbfd);
  color: var(--vu-ink, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  padding-bottom: 56px;
}

.vu-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 20px 0;
  display: grid;
  gap: 18px;
}

/* 顶部 */
.vu-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.vu-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  background: var(--vu-accent, #2fa84f);
}
.vu-topbar__name {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  color: var(--vu-ink, #1d1d1f);
}
.vu-topbar__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.vu-tag {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.vu-tag--ai {
  background: rgba(47, 168, 79, 0.12);
  color: var(--vu-accent-dark, #258a41);
}
.vu-tag--human {
  background: var(--vu-muted-surface, #f1f1f4);
  color: var(--vu-muted, #6e6e73);
}
.vu-at {
  font-size: 13px;
  color: var(--vu-muted, #6e6e73);
}

/* 主视觉大卡片 */
.vu-maincard {
  background: #fff;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.vu-maincard__title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--vu-ink, #1d1d1f);
}
.vu-maintabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.vu-maintab {
  padding: 8px 16px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 999px;
  background: var(--vu-muted-surface, #f1f1f4);
  color: var(--vu-ink-soft, #424245);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.vu-maintab--active {
  background: var(--vu-accent, #2fa84f);
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}

/* 切换过渡 */
.vu-fade-enter-active,
.vu-fade-leave-active {
  transition: opacity 0.16s ease;
}
.vu-fade-enter-from,
.vu-fade-leave-to {
  opacity: 0;
}

/* 简介 */
.vu-intro__text {
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--vu-ink-soft, #424245);
}
.vu-intro__perm {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.vu-intro__perm-label {
  font-size: 13px;
  color: var(--vu-muted, #6e6e73);
}
.vu-select {
  padding: 6px 10px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 8px;
  background: #fff;
  color: var(--vu-ink, #1d1d1f);
  font-size: 13px;
}
.vu-intro__hint {
  font-size: 12px;
  color: var(--vu-muted, #6e6e73);
}

/* 中部折叠模块 */
.vu-modules {
  display: grid;
  gap: 12px;
}
.vu-module {
  background: #fff;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 14px;
  overflow: hidden;
}
.vu-module__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.vu-module__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--vu-ink, #1d1d1f);
}
.vu-chev {
  color: var(--vu-muted, #6e6e73);
  transition: transform 0.2s ease;
}
.vu-chev.open {
  transform: rotate(180deg);
  color: var(--vu-accent, #2fa84f);
}
.vu-rows {
  border-top: 1px solid var(--vu-line, #e3e3e8);
}
.vu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 13px 16px;
  border: 0;
  border-top: 1px solid var(--vu-line, #e3e3e8);
  background: transparent;
  color: var(--vu-ink-soft, #424245);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
}
.vu-row:first-child {
  border-top: 0;
}
.vu-row:hover {
  background: var(--vu-muted-surface, #f1f1f4);
}
.vu-row__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.vu-row__chev {
  color: var(--vu-muted, #6e6e73);
}
.vu-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vu-danger, #e0483b);
  display: inline-block;
}

/* 底部纯图标按钮 */
.vu-bottombar {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 12px 0;
  background: var(--vu-paper, #fbfbfd);
}
.vu-iconbtn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--vu-line, #e3e3e8);
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.vu-iconbtn__icon {
  font-size: 22px;
  line-height: 1;
}
.vu-iconbtn:hover {
  background: rgba(47, 168, 79, 0.12);
  border-color: var(--vu-accent, #2fa84f);
}

/* 弹窗 */
.vu-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.4);
}
.vu-modal-backdrop--top {
  z-index: 1200;
}
.vu-modal {
  width: min(560px, 100%);
  max-height: 86vh;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
}
.vu-modal--wide {
  width: min(720px, 100%);
}
.vu-modal__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--vu-line, #e3e3e8);
}
.vu-modal__header h3 {
  margin: 0;
  font-size: 17px;
  color: var(--vu-ink, #1d1d1f);
  flex: 1;
}
.vu-modal__members {
  color: var(--vu-muted, #6e6e73);
  font-size: 12px;
}
.vu-dissolve {
  padding: 5px 12px;
  border: 1px solid rgba(224, 72, 59, 0.3);
  border-radius: 8px;
  background: transparent;
  color: var(--vu-danger, #e0483b);
  cursor: pointer;
  font-size: 12px;
}
.vu-modal__close {
  border: none;
  background: transparent;
  color: var(--vu-muted, #6e6e73);
  cursor: pointer;
  font-size: 16px;
}
.vu-modal__body {
  padding: 18px;
}
.vu-empty {
  padding: 32px;
  text-align: center;
  color: var(--vu-muted, #6e6e73);
  font-size: 14px;
}

/* 广场消息列表（外壳） */
.vu-msglist {
  display: grid;
  gap: 8px;
}
.vu-msgitem {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.vu-msgitem:hover {
  background: var(--vu-muted-surface, #f1f1f4);
}
.vu-msgitem__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vu-msgitem__head strong {
  font-size: 14px;
}
.vu-msgitem__head small {
  color: var(--vu-muted, #6e6e73);
  font-size: 12px;
}
.vu-msgitem__summary {
  color: var(--vu-ink-soft, #424245);
  font-size: 13px;
}

/* 群列表 */
.vu-grouplist {
  display: grid;
  gap: 8px;
}
.vu-group {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.vu-group:hover {
  background: var(--vu-muted-surface, #f1f1f4);
}
.vu-group__avatars {
  display: flex;
  flex-shrink: 0;
}
.vu-group__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--vu-accent, #2fa84f);
  border: 2px solid #fff;
  margin-left: -8px;
}
.vu-group__avatar:first-child {
  margin-left: 0;
}
.vu-group__main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}
.vu-group__main strong {
  font-size: 14px;
}
.vu-group__preview {
  color: var(--vu-muted, #6e6e73);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vu-group__side {
  flex-shrink: 0;
  color: var(--vu-muted, #6e6e73);
  font-size: 12px;
}

/* 心愿看板 */
.vu-wishlist {
  display: grid;
  gap: 10px;
}
.vu-wish {
  padding: 14px 16px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 12px;
}
.vu-wish__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.vu-wish__head strong {
  font-size: 15px;
}
.vu-wish__author {
  font-size: 12px;
  color: var(--vu-muted, #6e6e73);
}
.vu-wish__body {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vu-ink-soft, #424245);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 群聊 */
.vu-modal--chat {
  display: flex;
  flex-direction: column;
}
.vu-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  overflow: auto;
  min-height: 200px;
  max-height: 46vh;
}
.vu-msg {
  display: grid;
  gap: 2px;
  align-self: flex-start;
  max-width: 80%;
}
.vu-msg--mine {
  align-self: flex-end;
}
.vu-msg__author {
  font-size: 12px;
  color: var(--vu-muted, #6e6e73);
}
.vu-msg__content {
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--vu-muted-surface, #f1f1f4);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.vu-msg--mine .vu-msg__content {
  background: rgba(47, 168, 79, 0.14);
}
.vu-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--vu-line, #e3e3e8);
}
.vu-composer textarea {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 8px;
  background: #fff;
  color: var(--vu-ink, #1d1d1f);
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

/* 密码表单 */
.vu-pwform {
  display: grid;
  gap: 14px;
}
.vu-field {
  display: grid;
  gap: 6px;
}
.vu-field > span {
  font-size: 13px;
  color: var(--vu-ink-soft, #424245);
}
.vu-field input {
  padding: 10px 12px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 8px;
  background: #fff;
  color: var(--vu-ink, #1d1d1f);
  font-size: 14px;
  font-family: inherit;
}
.vu-field__error {
  color: var(--vu-danger, #e0483b);
  font-size: 12px;
}
.vu-error {
  margin: 0;
  color: var(--vu-danger, #e0483b);
  font-size: 13px;
}
.vu-done {
  margin: 0;
  color: var(--vu-accent-dark, #258a41);
  font-size: 13px;
}

/* 按钮 */
.vu-btn {
  padding: 10px 20px;
  border: 1px solid var(--vu-line, #e3e3e8);
  border-radius: 999px;
  background: transparent;
  color: var(--vu-ink-soft, #424245);
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
}
.vu-btn--primary {
  background: var(--vu-accent, #2fa84f);
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}
.vu-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 游客态 */
.vu-profile-guest {
  background: var(--vu-paper, #fbfbfd);
  color: var(--vu-ink, #1d1d1f);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  min-height: 60vh;
  display: grid;
  place-items: center;
}
.vu-profile-guest .vu-container {
  text-align: center;
  display: grid;
  gap: 12px;
  justify-items: center;
}
.vu-profile-guest h1 {
  margin: 0;
  font-size: 24px;
}
.vu-profile-guest p {
  margin: 0;
  color: var(--vu-muted, #6e6e73);
}
.vu-kicker {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--vu-muted, #6e6e73);
}
</style>
