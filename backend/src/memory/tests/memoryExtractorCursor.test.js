/**
 * 增量提炼游标 单元测试：验证修复「记忆回潮」Bug。
 * 用法：node --test backend/src/memory/tests/memoryExtractorCursor.test.js
 */
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openMemoryDatabase } from '../database.mjs';
import { createLlmClient } from '../llmClient.mjs';
import { createMemoryOrchestrator } from '../memoryOrchestrator.mjs';

const dbPath = 'H:/BP2/data/cursor-test.sqlite';
const userId = 'u_cursor';
let db;
let orchestrator;

beforeEach(() => {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  for (const s of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + s, { force: true });
    } catch {
      // ignore
    }
  }
  db = openMemoryDatabase({ databasePath: dbPath });
  orchestrator = createMemoryOrchestrator({
    db,
    llmClient: createLlmClient({ apiKey: '' }),
  });
  orchestrator.ensureUser(userId);
});

after(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  for (const s of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + s, { force: true });
    } catch {
      // ignore
    }
  }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('增量提炼：清空记忆后继续对话，旧记忆不被重新生成', async () => {
  // 1. 首轮对话提炼出「种花」记忆
  const r1 = await orchestrator.chat({ userId, message: '我喜欢在院子里种花' });
  await wait(100);
  let mems = orchestrator.retrieveMemory({ userId, limit: 100 });
  assert.ok(
    mems.some((m) => m.content.includes('种花') || m.content.includes('院子')),
    '首轮应提炼出种花记忆',
  );

  // 2. 清空记忆
  const cleared = orchestrator.clearMemory({ userId });
  assert.ok(cleared >= 1, '清空应删除至少 1 条');
  mems = orchestrator.retrieveMemory({ userId, limit: 100 });
  assert.equal(mems.length, 0, '清空后应为 0');

  // 3. 继续对话（复用 conversationId），验证旧记忆不被重新生成
  await orchestrator.chat({
    userId,
    conversationId: r1.conversationId,
    message: '继续聊聊天气',
  });
  await wait(100);
  mems = orchestrator.retrieveMemory({ userId, limit: 100 });
  assert.ok(
    !mems.some((m) => m.content.includes('种花') || m.content.includes('院子')),
    '旧记忆不应被重新生成（修复回潮）',
  );
});

test('增量提炼：游标推进后，新事实仍可正常提炼', async () => {
  const r1 = await orchestrator.chat({ userId, message: '我喜欢在院子里种花' });
  await wait(100);
  await orchestrator.chat({
    userId,
    conversationId: r1.conversationId,
    message: '我是社区规划师',
  });
  await wait(100);
  const mems = orchestrator.retrieveMemory({ userId, limit: 100 });
  assert.ok(
    mems.some((m) => m.content.includes('种花') || m.content.includes('院子')),
    '首轮记忆应保留',
  );
  assert.ok(
    mems.some((m) => m.content.includes('社区规划师')),
    '新一轮新事实应被提炼',
  );
});
