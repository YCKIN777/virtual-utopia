import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResidentSocialStore, GROUP_MAX_MEMBERS } from '../residentSocialStore.js';

test('居民社交：私聊隔离 + 群成员/消息', () => {
  const store = createResidentSocialStore({ databasePath: ':memory:' });

  // 私聊
  store.createDirectMessage({ fromUserId: 1, toUserId: 2, content: 'a->b' });
  store.createDirectMessage({ fromUserId: 2, toUserId: 1, content: 'b->a' });
  store.createDirectMessage({ fromUserId: 1, toUserId: 3, content: 'a->c' });

  const ab = store.listDirectMessages(1, 2);
  assert.equal(ab.length, 2);
  assert.deepEqual(ab.map((m) => m.content), ['a->b', 'b->a']);

  const bc = store.listDirectMessages(2, 3);
  assert.equal(bc.length, 0); // 隔离：B↔C 无消息

  // 群
  const group = store.createGroup({
    name: '远林小分队',
    creatorUserId: 1,
    creatorUsername: 'alice',
    memberIds: [
      { userId: 2, username: 'bob' },
      { userId: 3, username: 'carol' },
    ],
  });

  assert.equal(store.listMembers(group.id).length, 3);
  assert.equal(store.isMember(group.id, 1), true);
  assert.equal(store.isMember(group.id, 2), true);
  assert.equal(store.isMember(group.id, 99), false);

  store.createGroupMessage({ groupId: group.id, fromUserId: 1, fromUsername: 'alice', content: '集合' });
  const msgs = store.listGroupMessages(group.id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].content, '集合');

  // 我的群
  const groups = store.listGroupsByUser(2);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, group.id);

  // 常量
  assert.equal(GROUP_MAX_MEMBERS, 8);

  store.close();
});
