/**
 * 记忆架构冒烟测试：验证两个核心场景。
 *  场景1：新开窗口新建会话，同一 user_id 自动加载长期记忆 + 世界状态，无历史对话上下文。
 *  场景2：新窗口传入 conversation_id，完整加载历史消息，上下文无缝衔接。
 *
 * 用法：node scripts/test-memory.mjs
 */
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMemoryDatabase, newId, now } from '../backend/src/memory/database.mjs';
import { createLlmClient } from '../backend/src/memory/llmClient.mjs';
import { createMemoryOrchestrator } from '../backend/src/memory/memoryOrchestrator.mjs';

const dbPath = 'H:/BP2/data/smoke-memory.sqlite';
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(dbPath + suffix, { force: true });
  } catch {
    // ignore
  }
}

const db = openMemoryDatabase({ databasePath: dbPath });
const llmClient = createLlmClient({ apiKey: '' }); // 无 key → mock 模式
const orchestrator = createMemoryOrchestrator({ db, llmClient });

const userId = 'u_smoke';

try {
  // 预置用户 + 长期记忆 + 世界状态
  orchestrator.ensureUser(userId);
  db.prepare(
    'INSERT INTO user_memory (id, user_id, content, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(newId('mem'), userId, '用户偏好宋式美学风格', 'preference', 0.9, now(), now());
  db.prepare(
    'INSERT INTO user_memory (id, user_id, content, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(newId('mem'), userId, '用户职业是社区规划师', 'identity', 0.8, now(), now());
  orchestrator.worldState.set({
    key: 'scene:yard',
    kind: 'scene',
    payload: { npc: '阿禾', desc: '社区大院' },
  });

  // 场景1：新会话（不传 conversation_id）
  const r1 = await orchestrator.chat({ userId, message: '你好，介绍一下社区' });
  assert.ok(r1.conversationId, '场景1 应返回 conversationId');
  assert.ok(r1.memories.length >= 2, '场景1 应自动加载长期记忆（≥2 条）');
  assert.ok(r1.worldStates.length >= 1, '场景1 应自动加载世界状态（≥1 项）');
  assert.equal(r1.historyCount, 0, '场景1 新会话应无历史对话上下文');
  console.log('[场景1] 新会话 conversationId=' + r1.conversationId);
  console.log('[场景1] 加载长期记忆 ' + r1.memories.length + ' 条，世界状态 ' + r1.worldStates.length + ' 项，历史 ' + r1.historyCount + ' 条');
  console.log('[场景1] mock 回复:', r1.reply);

  // 场景2：复用 conversation_id（模拟新窗口带入会话 ID）
  const r2 = await orchestrator.chat({
    userId,
    conversationId: r1.conversationId,
    message: '继续，我偏好什么样的风格？',
  });
  assert.equal(r2.conversationId, r1.conversationId, '场景2 应复用同一会话');
  assert.ok(r2.historyCount > 0, '场景2 应完整加载历史消息');
  console.log('[场景2] 复用会话 conversationId=' + r2.conversationId);
  console.log('[场景2] 加载历史消息 ' + r2.historyCount + ' 条');
  console.log('[场景2] mock 回复:', r2.reply);

  // 校验异步记忆提炼（非阻塞，等待短暂时间后入库）
  await new Promise((resolve) => setTimeout(resolve, 200));
  const memories = orchestrator.retrieveMemory({ userId, limit: 100 });
  const extracted = memories.filter((m) => m.source_conversation_id === r1.conversationId);
  console.log('[异步提炼] 用户记忆总数 ' + memories.length + ' 条，其中本轮提炼 ' + extracted.length + ' 条');

  console.log('\n[记忆冒烟测试] 全部通过 ✅');
} finally {
  try {
    db.close();
  } catch {
    // ignore
  }
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch {
      // ignore
    }
  }
}
