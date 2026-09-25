// backend/tests/conversationRegistry.test.js
// 待办⑥：conversationId → owner 归属注册表单测。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationRegistry } from '../src/services/conversationRegistry.js';

test('register：记录 owner（userId/role/username + 时间戳）', () => {
  const registry = createConversationRegistry();
  registry.register('conv-1', { userId: 40, role: 'admin', username: 'KIN' });

  const owner = registry.getOwner('conv-1');

  assert.equal(owner.userId, 40);
  assert.equal(owner.role, 'admin');
  assert.equal(owner.username, 'KIN');
  assert.ok(owner.createdAt > 0);
});

test('register：缺 conversationId 或游客（无 userId）不注册', () => {
  const registry = createConversationRegistry();

  registry.register(null, { userId: 1 });
  registry.register('conv-2', null);
  registry.register('conv-3', { role: 'viewer' }); // 无 userId

  assert.equal(registry.size, 0);
});

test('isOwner：匹配返回 true，不匹配/缺失返回 false', () => {
  const registry = createConversationRegistry();
  registry.register('conv-1', { userId: 7, role: 'editor' });

  assert.equal(registry.isOwner('conv-1', 7), true);
  assert.equal(registry.isOwner('conv-1', 8), false);
  assert.equal(registry.isOwner('conv-x', 7), false);
  assert.equal(registry.isOwner('conv-1', null), false);
});

test('register：同一会话可更新 owner（最后写入者生效），createdAt 保留首次', () => {
  const registry = createConversationRegistry();
  registry.register('conv-1', { userId: 7, role: 'editor' });
  const firstCreatedAt = registry.getOwner('conv-1').createdAt;

  registry.register('conv-1', { userId: 9, role: 'viewer' });
  const owner = registry.getOwner('conv-1');

  assert.equal(owner.userId, 9);
  assert.equal(owner.createdAt, firstCreatedAt);
});

test('上限清理：超过 maxEntries 时 FIFO 淘汰', () => {
  const registry = createConversationRegistry({ maxEntries: 3 });

  registry.register('c1', { userId: 1 });
  registry.register('c2', { userId: 2 });
  registry.register('c3', { userId: 3 });
  registry.register('c4', { userId: 4 }); // 触发清理（保留最新一半）

  assert.ok(registry.size <= 3);
});
