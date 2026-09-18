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

test('enforces home ownership, material unlocks, and visitor actions', async () => {
  const store = createStore();
  const travelerHome = store.getHomePlot('plot-28');
  const publicHome = store.getHomePlot('plot-1');

  assert.equal(travelerHome.ownerId, 'traveler-001');
  assert.equal(store.canEditHome('plot-28'), false);
  assert.equal(store.canViewHome('plot-1'), true);

  await store.login({
    username: 'traveler',
    password: 'utopia2026',
  });

  assert.equal(store.canEditHome('plot-28'), true);
  assert.equal(store.canEditHome('plot-1'), false);
  assert.equal(
    store.addHomeItem({
      plotId: 'plot-28',
      materialId: 'house-cabin',
      x: 0.1,
      y: 0.1,
    }).materialId,
    'house-cabin',
  );
  assert.equal(
    store.addHomeItem({
      plotId: 'plot-1',
      materialId: 'house-cabin',
      x: 0.1,
      y: 0.1,
    }),
    null,
  );

  assert.equal(store.isMaterialUnlocked('house-stone'), false);
  const shardsBefore = store.state.user.worldShards;
  assert.equal(store.unlockMaterial('house-stone'), true);
  assert.equal(store.state.user.worldShards, shardsBefore - 3);

  assert.equal(
    store.addHomeMessage({
      plotId: 'plot-1',
      content: '这里很安静。',
    }),
    true,
  );
  const clue = store.discoverClue('plot-1');
  assert.equal(clue, '月光下的旧地图');
  assert.equal(store.state.user.worldShards, shardsBefore - 3 + 2);
  assert.equal(store.discoverClue('plot-1'), null);
});
