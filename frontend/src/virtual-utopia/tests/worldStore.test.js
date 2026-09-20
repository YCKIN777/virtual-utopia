import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorldStore } from '../stores/worldStore.js';

const createStore = () =>
  createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
  });

test('authenticates with memory-only demo credentials', async () => {
  const store = createStore();

  await assert.rejects(
    store.login({
      username: 'traveler',
      password: 'wrong',
    }),
    {
      code: 'INVALID_CREDENTIALS',
    },
  );

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.state.user.displayName, '漫游者');
  assert.equal(store.state.tasks.length, 2);

  const nextStore = createStore();
  assert.equal(nextStore.state.user, null);
});

test('accepts a task, unlocks its scene, and records the task', async () => {
  const store = createStore();

  await assert.rejects(
    store.acceptTask({
      sceneId: 'pavilion',
      task: {
        id: 'pavilion-council',
        title: '本周议事会',
        reward: '议题票 +1',
      },
    }),
    {
      code: 'LOGIN_REQUIRED',
    },
  );

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.isSceneUnlocked('pavilion'), false);
  assert.equal(
    await store.acceptTask({
      sceneId: 'pavilion',
      task: {
        id: 'pavilion-council',
        title: '本周议事会',
        reward: '议题票 +1',
      },
    }),
    true,
  );
  assert.equal(store.isSceneUnlocked('pavilion'), true);
  assert.equal(
    store.state.tasks.some((task) => task.id === 'pavilion-council'),
    true,
  );
});

test('enforces home ownership and visitor actions', async () => {
  const store = createStore();
  const travelerHome = store.getHomePlot('plot-28');

  // 批量初始化后，除 KIN 39 号宅院外，其余地块均为待分配（ownerName 空）
  assert.equal(travelerHome.ownerId, null);
  assert.equal(travelerHome.ownerName, '');
  assert.equal(store.canEditHome('plot-28'), false);
  // 默认关闭参观权限：未开放宅院外人不可浏览
  assert.equal(store.canViewHome('plot-1'), false);

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.canEditHome('plot-28'), true);
  assert.equal(store.canEditHome('plot-1'), false);

  // 参观权限：主人可开放/关闭；他人宅院不可改
  assert.equal(store.setVisitPermission('plot-28', true), true);
  assert.equal(store.getHomePlot('plot-28').visibility, 'public');
  assert.equal(store.setVisitPermission('plot-1', true), false);

  // 默认关闭参观权限：外人在未开放宅院不能留言/寻宝
  assert.equal(
    store.addHomeMessage({
      plotId: 'plot-1',
      content: '这里很安静。',
    }),
    false,
  );
  assert.equal(store.discoverClue('plot-1'), null);
});
