import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResidentCardStore } from '../residentCardStore.js';

test('居民卡片：CRUD + 权限过滤 + 收藏角强制仅自己', () => {
  const store = createResidentCardStore({ databasePath: ':memory:' });

  // 创建各类卡片
  const selfCard = store.create({
    userId: 1,
    username: 'alice',
    cardType: 'work_plan',
    content: { title: '私密计划', body: '仅自己' },
    permission: 'self',
  });
  const sharedCard = store.create({
    userId: 1,
    username: 'alice',
    cardType: 'work_plan',
    content: { title: '共建计划', body: '原住民可见' },
    permission: 'residents',
  });
  const favorite = store.create({
    userId: 1,
    username: 'alice',
    cardType: 'favorite',
    content: { title: '收藏远林', body: '仅本人' },
    permission: 'residents', // 外部传入 residents，应被强制为 self
  });

  assert.equal(selfCard.permission, 'self');
  assert.equal(sharedCard.permission, 'residents');
  assert.equal(favorite.permission, 'self');

  // 另一个居民 bob 创建
  const bobCard = store.create({
    userId: 2,
    username: 'bob',
    cardType: 'life_note',
    content: { title: 'bob 随笔', body: '公开' },
    permission: 'residents',
  });

  // alice 的 mine：3 条
  const mine = store.listByUser(1);
  assert.equal(mine.length, 3);

  // alice 视角的 community：bob 的 residents 项（不含 favorite）
  const community = store.listCommunity(1);
  assert.equal(community.length, 1);
  assert.equal(community[0].id, bobCard.id);

  // bob 视角的 community：alice 的 sharedCard（不含 self、不含 favorite）
  const bobCommunity = store.listCommunity(2);
  assert.equal(bobCommunity.length, 1);
  assert.equal(bobCommunity[0].id, sharedCard.id);

  // 更新
  const updated = store.update(sharedCard.id, {
    content: { title: '共建计划v2', body: '更新' },
    permission: 'self',
  });
  assert.equal(updated.permission, 'self');
  assert.equal(updated.content.title, '共建计划v2');

  // favorite 更新时权限仍被强制 self
  const favUpdated = store.update(favorite.id, {
    content: { title: '改', body: 'x' },
    permission: 'residents',
  });
  assert.equal(favUpdated.permission, 'self');

  // 删除
  const removed = store.remove(selfCard.id);
  assert.equal(removed.id, selfCard.id);
  assert.equal(store.listByUser(1).length, 2);

  // 不存在的 id
  assert.equal(store.getById('nope'), null);
  assert.equal(store.update('nope', { content: { title: 'x' } }), null);
  assert.equal(store.remove('nope'), null);

  store.close();
});

test('卡片交互：报名/帮你/想要/评论 + 删除级联', () => {
  const store = createResidentCardStore({ databasePath: ':memory:' });
  const card = store.create({
    userId: 1, username: 'alice', cardType: 'travel_log',
    content: { title: '远林', body: '去' }, permission: 'residents',
  });

  store.createInteraction({ cardId: card.id, userId: 2, username: 'bob', kind: 'signup' });
  store.createInteraction({ cardId: card.id, userId: 3, username: 'carol', kind: 'comment', content: '一起' });

  const list = store.listInteractions(card.id);
  assert.equal(list.length, 2);
  assert.equal(list[0].kind, 'signup');
  assert.equal(list[1].content, '一起');

  // 删除卡片时级联删除交互
  store.remove(card.id);
  assert.equal(store.listInteractions(card.id).length, 0);

  store.close();
});
