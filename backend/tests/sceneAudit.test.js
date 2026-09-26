// backend/tests/sceneAudit.test.js
// P5.2-⑧：KIN 审批（HITL resume）决策审计 —— store 语义 + 路由留痕与查询。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSceneAuditStore } from '../src/services/sceneAuditStore.js';

test('sceneAudit：记录与查询（按 approved 过滤 + 分页）', () => {
  const store = createSceneAuditStore({ databasePath: ':memory:' });

  store.record({
    conversationId: 'c1',
    actorUserId: 40,
    actorUsername: 'KIN',
    actorRole: 'admin',
    approved: true,
    reason: 'KIN 批准',
  });
  store.record({
    conversationId: 'c2',
    actorUserId: 50,
    actorUsername: 'traveler',
    actorRole: 'editor',
    approved: false,
    reason: 'KIN 拒绝',
  });

  const all = store.list();
  assert.equal(all.length, 2);
  assert.equal(all[0].conversationId, 'c2', '按时间倒序（后记录在前）');
  assert.equal(all[0].approved, false);
  assert.equal(all[0].actorRole, 'editor');

  const approved = store.list({ approved: true });
  assert.equal(approved.length, 1);
  assert.equal(approved[0].conversationId, 'c1');

  const rejected = store.list({ approved: false });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'KIN 拒绝');

  store.close();
});

test('sceneAudit：文件实例跨重启（close→reopen）审计保留', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scene-audit-'));
  const file = path.join(dir, 'audit.db');

  const storeA = createSceneAuditStore({ databasePath: file });
  storeA.record({
    conversationId: 'c3',
    actorUserId: 40,
    actorUsername: 'KIN',
    actorRole: 'admin',
    approved: true,
    reason: '跨重启验证',
  });
  storeA.close();

  const storeB = createSceneAuditStore({ databasePath: file });
  const events = storeB.list();
  assert.equal(events.length, 1);
  assert.equal(events[0].conversationId, 'c3');
  assert.equal(events[0].approved, true);
  storeB.close();

  rmSync(dir, { recursive: true, force: true });
});

test('sceneAudit：limit/offset 分页约束', () => {
  const store = createSceneAuditStore({ databasePath: ':memory:' });

  for (let i = 0; i < 5; i += 1) {
    store.record({
      conversationId: `p-${i}`,
      actorUserId: 1,
      actorUsername: 'admin',
      actorRole: 'admin',
      approved: i % 2 === 0,
    });
  }

  assert.equal(store.list({ limit: 2 }).length, 2);
  assert.equal(store.list({ limit: 2, offset: 2 }).length, 2);
  assert.equal(store.list({ limit: 1000 }).length, 5, 'limit 钳制到 500');

  store.close();
});
