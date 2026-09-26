// backend/tests/persistenceServices.test.js
// P5.2-⑥：验证码服务 / 会话归属注册表 —— SQLite 持久化语义测试。
// 覆盖：内存实例行为不变 + 文件实例跨重启（close→reopen）数据保留。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCaptchaService } from '../src/services/captchaService.js';
import { createConversationRegistry } from '../src/services/conversationRegistry.js';

test('captcha：创建 → 校验成功（一次性）→ 二次校验失败', () => {
  const service = createCaptchaService({ databasePath: ':memory:' });

  const { captchaId } = service.create();
  assert.ok(captchaId);
  const correct = service._answerForTest(captchaId);

  assert.equal(service.verify(captchaId, correct), true);
  assert.equal(service.verify(captchaId, correct), false, '一次性：二次校验失败');
  assert.equal(service.size(), 0, '校验后条目删除');

  service.close();
});

test('captcha：一次性语义 —— 校验后同 id 再次校验失败', () => {
  const service = createCaptchaService({ databasePath: ':memory:' });

  const { captchaId } = service.create();
  const correct = service._answerForTest(captchaId);
  assert.equal(typeof correct, 'string');

  assert.equal(service.verify(captchaId, correct), true);
  assert.equal(service.verify(captchaId, correct), false, '一次性：二次校验失败');
  assert.equal(service.size(), 0, '校验后条目删除');

  service.close();
});

test('captcha：错误答案与过期均返回 false 并删除', () => {
  let clock = 1000;
  const service = createCaptchaService({
    databasePath: ':memory:',
    ttlMs: 100,
    now: () => clock,
  });

  const { captchaId } = service.create();
  const correct = service._answerForTest(captchaId);

  assert.equal(service.verify(captchaId, '0000'), false, '错误答案 false');
  assert.equal(service.size(), 0, '错误校验也消耗（一次性）');

  const { captchaId: id2 } = service.create();
  const correct2 = service._answerForTest(id2);
  clock += 200;
  assert.equal(service.verify(id2, correct2), false, '过期 false');
  assert.equal(service.size(), 0);

  service.close();
});

test('captcha：超过上限清理最旧条目（sweep）', () => {
  const service = createCaptchaService({
    databasePath: ':memory:',
    maxEntries: 5,
  });

  for (let i = 0; i < 8; i += 1) {
    service.create();
  }

  assert.ok(service.size() <= 5, `存量受上限约束（实际 ${service.size()}）`);
  service.close();
});

test('captcha：文件实例跨重启（close→reopen）未过期验证码仍可校验', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'captcha-persist-'));
  const file = path.join(dir, 'captcha.db');

  const serviceA = createCaptchaService({ databasePath: file });
  const { captchaId } = serviceA.create();
  const correct = serviceA._answerForTest(captchaId);
  serviceA.close();

  const serviceB = createCaptchaService({ databasePath: file });
  assert.equal(serviceB.size(), 1, '重启后条目保留');
  assert.equal(serviceB.verify(captchaId, correct), true, '重启后仍可校验');
  serviceB.close();

  rmSync(dir, { recursive: true, force: true });
});

test('conversationRegistry：注册/查询/归属校验', () => {
  const registry = createConversationRegistry({ databasePath: ':memory:' });

  registry.register('c1', { userId: 40, role: 'admin', username: 'KIN' });
  registry.register('c1', { userId: 40, role: 'admin', username: 'KIN' });

  const owner = registry.getOwner('c1');
  assert.equal(owner.userId, 40);
  assert.equal(owner.username, 'KIN');
  assert.equal(registry.isOwner('c1', 40), true);
  assert.equal(registry.isOwner('c1', 99), false);
  assert.equal(registry.isOwner('missing', 40), false);
  assert.equal(registry.getOwner('missing'), null);

  registry.close();
});

test('conversationRegistry：异人更新覆盖 owner（最后写入者）', () => {
  const registry = createConversationRegistry({ databasePath: ':memory:' });

  registry.register('c2', { userId: 40, role: 'admin', username: 'KIN' });
  registry.register('c2', { userId: 50, role: 'resident', username: 'other' });

  assert.equal(registry.getOwner('c2').userId, 50);
  assert.equal(registry.isOwner('c2', 40), false);

  registry.close();
});

test('conversationRegistry：上限 FIFO 清理', () => {
  const registry = createConversationRegistry({
    databasePath: ':memory:',
    maxEntries: 6,
  });

  for (let i = 0; i < 10; i += 1) {
    registry.register(`conv-${i}`, { userId: i, username: `u${i}` });
  }

  assert.ok(registry.size <= 6, `存量受上限约束（实际 ${registry.size}）`);
  assert.equal(registry.getOwner('conv-0'), null, '最旧被清理');

  registry.close();
});

test('conversationRegistry：文件实例跨重启（close→reopen）归属保留', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'conv-reg-persist-'));
  const file = path.join(dir, 'conv.db');

  const registryA = createConversationRegistry({ databasePath: file });
  registryA.register('c3', { userId: 40, role: 'admin', username: 'KIN' });
  registryA.close();

  const registryB = createConversationRegistry({ databasePath: file });
  assert.equal(registryB.getOwner('c3').userId, 40, '重启后归属保留');
  assert.equal(registryB.isOwner('c3', 40), true);
  registryB.close();

  rmSync(dir, { recursive: true, force: true });
});
