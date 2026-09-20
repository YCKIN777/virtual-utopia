import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorldStore } from '../stores/worldStore.js';

const createStore = () =>
  createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
  });

const asUser = (store, id, role) => {
  store.state.user = {
    id,
    username: role,
    role,
    displayName: role,
  };
  store.state.permissions = {
    role,
    canManageHome: ['admin', 'editor'].includes(role),
  };
};

test('KIN 宅院参观权限准入逻辑（城主/居民/游客三角色）', () => {
  const store = createStore();

  // 39 号宅院绑定给 KIN
  const kinHome = store.getHomePlot('plot-39');
  assert.equal(kinHome.ownerId, 'kin-lord');
  assert.equal(kinHome.ownerName, 'KIN');
  assert.equal(store.getKinHome().id, 'plot-39');

  // 1. KIN（城主 admin）永远可查看/编辑 39 号宅院（无论开关）
  asUser(store, 'phase5-1', 'admin');
  assert.equal(store.canEditKinHome(), true);
  assert.equal(store.canViewHome('plot-39'), true);
  assert.equal(store.canEditHome('plot-39'), true);

  // 2. 参观开关关闭（private）
  assert.equal(store.setVisitPermission('plot-39', false), true);
  assert.equal(store.getHomePlot('plot-39').visibility, 'private');

  // 3. 关闭状态：居民(editor)、游客(viewer) 无法进入（浏览）也无法编辑
  asUser(store, 'phase5-2', 'editor');
  assert.equal(store.canViewHome('plot-39'), false);
  assert.equal(store.canEditHome('plot-39'), false);

  asUser(store, 'phase5-3', 'viewer');
  assert.equal(store.canViewHome('plot-39'), false);
  assert.equal(store.canEditHome('plot-39'), false);

  // 4. 参观开关开启（public）
  asUser(store, 'phase5-1', 'admin');
  assert.equal(store.setVisitPermission('plot-39', true), true);
  assert.equal(store.getHomePlot('plot-39').visibility, 'public');

  // 5. 开启状态：居民/游客可浏览，但不能编辑（装扮面板锁定）
  asUser(store, 'phase5-2', 'editor');
  assert.equal(store.canViewHome('plot-39'), true);
  assert.equal(store.canEditHome('plot-39'), false);

  asUser(store, 'phase5-3', 'viewer');
  assert.equal(store.canViewHome('plot-39'), true);
  assert.equal(store.canEditHome('plot-39'), false);

  // 6. KIN 关闭开关后依然可进入自己宅院并编辑
  asUser(store, 'phase5-1', 'admin');
  assert.equal(store.setVisitPermission('plot-39', false), true);
  assert.equal(store.canViewHome('plot-39'), true);
  assert.equal(store.canEditHome('plot-39'), true);
});

test('普通居民只能编辑自己的宅院，不能编辑 KIN 宅院', async () => {
  const store = createStore();

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  const ownHome = store.getOwnedHome();
  assert.ok(ownHome);
  assert.equal(store.canEditHome(ownHome.id), true);
  assert.equal(store.canEditHome('plot-39'), false);
  assert.equal(store.canEditKinHome(), false);
});
