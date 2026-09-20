import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorldStore } from '../stores/worldStore.js';

const createStore = () =>
  createWorldStore({
    wait: async () => {},
    autoDismissMs: 0,
  });

test('批量初始化 50 块宅院地块 + assignHome 分配接口', () => {
  const store = createStore();
  const homes = store.state.homes;

  // 1. 共 50 块地块
  assert.equal(homes.length, 50);

  // 2. plot-39 归属 KIN 保持不变
  const kin = store.getHomePlot('plot-39');
  assert.equal(kin.ownerName, 'KIN');
  assert.equal(kin.ownerId, 'kin-lord');

  // 3. 其余 49 块：ownerName 空、visitEnabled 默认 false、ownerId null、坐标预生成
  let unassigned = 0;
  for (const home of homes) {
    if (home.id === 'plot-39') {
      continue;
    }
    assert.equal(home.ownerName, '');
    assert.equal(home.visitEnabled, false);
    assert.equal(home.ownerId, null);
    assert.ok(Number.isFinite(home.x) && Number.isFinite(home.y));
    unassigned += 1;
  }
  assert.equal(unassigned, 49);

  // 4. assignHome 分配地块并自动写入 ownerName
  assert.equal(store.assignHome('plot-1', '风铃'), true);
  const p1 = store.getHomePlot('plot-1');
  assert.equal(p1.ownerName, '风铃');
  assert.equal(p1.ownerId, 'resident-风铃');
  assert.equal(p1.visitEnabled, false);

  // 5. assignHome 无效输入被拒绝
  assert.equal(store.assignHome('plot-2', '   '), false);
  assert.equal(store.assignHome('plot-999', '某人'), false);
});
