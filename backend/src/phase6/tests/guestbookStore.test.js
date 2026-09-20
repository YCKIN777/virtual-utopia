import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGuestbookStore } from '../guestbookStore.js';

test('邻里留言簿：留言 CRUD', () => {
  const store = createGuestbookStore({ databasePath: ':memory:' });

  const m1 = store.create({ fromUserId: 1, fromUsername: 'alice', content: '大家好' });
  const m2 = store.create({ fromUserId: 2, fromUsername: 'bob', content: '欢迎' });

  assert.equal(m1.fromUsername, 'alice');
  assert.equal(m1.content, '大家好');

  // 倒序：最新在前
  const list = store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, m2.id);

  // 删除
  const removed = store.remove(m1.id);
  assert.equal(removed.id, m1.id);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, m2.id);

  // 不存在的 id
  assert.equal(store.getById('nope'), null);
  assert.equal(store.remove('nope'), null);

  store.close();
});
