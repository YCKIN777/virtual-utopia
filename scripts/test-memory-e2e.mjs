/**
 * 前后端记忆架构 全链路端到端联调冒烟测试（真实 HTTP + 真实 SQLite 持久化）。
 * 场景1~5 见脚本内注释。用法：node scripts/test-memory-e2e.mjs
 */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openMemoryDatabase, newId, now } from '../backend/src/memory/database.mjs';
import { createLlmClient } from '../backend/src/memory/llmClient.mjs';
import { createMemoryOrchestrator } from '../backend/src/memory/memoryOrchestrator.mjs';
import { createMemoryApp } from '../backend/src/memory/httpServer.mjs';
import { createGuardedApp } from '../backend/src/runtime/guard.js';
import { createSessionApi } from '../frontend/src/session/sessionApi.js';
import { createSessionStore } from '../frontend/src/session/sessionStore.js';
import {
  parseConversationIdFromUrl,
  buildConversationUrl,
  openConversation,
} from '../frontend/src/session/sessionUtils.js';

const dbPath = 'H:/BP2/data/e2e-memory.sqlite';
const PORT = 3610;
const BASE = 'http://localhost:' + PORT;
const userId = 'u_e2e';

for (const s of ['', '-wal', '-shm']) {
  try {
    rmSync(dbPath + s, { force: true });
  } catch {
    // ignore
  }
}

// 预置：用户 + 长期记忆 + 世界状态
const db = openMemoryDatabase({ databasePath: dbPath });
const orchestrator = createMemoryOrchestrator({
  db,
  llmClient: createLlmClient({ apiKey: '' }),
});
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

// 启动 HTTP 服务（挂载 guard，放宽限流便于测试）
const memoryApp = createMemoryApp({ orchestrator });
const { app } = createGuardedApp({
  service: 'memory-e2e',
  app: memoryApp,
  options: { rateLimit: { maxRequests: 10000 } },
});
const server = await new Promise((resolve, reject) => {
  const s = app.listen(PORT, 'localhost');
  s.once('listening', () => resolve(s));
  s.once('error', reject);
});
const closeServer = () =>
  new Promise((resolve) => {
    server.close(() => {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve();
    });
  });

const api = createSessionApi({ baseUrl: BASE, fetchImpl: globalThis.fetch });
const memApi = {
  listMemories: async (uid) => {
    const res = await fetch(BASE + '/api/user/memory?userId=' + uid);
    return res.json();
  },
};

let conversationId;

try {
  // ===== 场景1：新开窗口新建会话（不传 conversation_id）=====
  {
    const req = { userId, message: '你好，介绍一下社区' };
    const r = await api.chat(req);
    conversationId = r.conversationId;
    console.log('[场景1] 请求:', JSON.stringify(req));
    console.log('[场景1] 响应: conversationId=' + r.conversationId +
      ' 记忆=' + r.memories.length + ' 世界状态=' + r.worldStates.length +
      ' 历史=' + r.historyCount);
    assert.ok(r.conversationId, '场景1 应生成 conversationId');
    assert.ok(r.memories.length >= 2, '场景1 应加载长期记忆');
    assert.ok(r.worldStates.length >= 1, '场景1 应加载世界状态');
    assert.equal(r.historyCount, 0, '场景1 新会话不应携带历史上下文');
  }

  // ===== 场景2：点击历史会话新开标签（URL 带 conversation_id）=====
  {
    const conv = await api.getConversation(conversationId);
    const url = buildConversationUrl('http://localhost:5173/session', conversationId);
    let opened = null;
    openConversation({
      conversationId,
      base: 'http://localhost:5173/session',
      windowObj: { open: (u) => { opened = u; } },
    });
    console.log('[场景2] 请求: GET /api/conversation/' + conversationId);
    console.log('[场景2] 响应: 历史消息 ' + conv.messages.length + ' 条；新窗口 URL=' + opened);
    assert.ok(conv.messages.length >= 2, '场景2 应完整拉取历史消息');
    assert.ok(url.includes('conversation_id=' + conversationId), '场景2 URL 应带 ID');
    assert.ok(opened && opened.includes('conversation_id=' + conversationId), '场景2 新窗口应带 ID');

    const r2 = await api.chat({ userId, conversationId, message: '继续说说社区' });
    console.log('[场景2] 续接请求 conversationId=' + conversationId +
      ' → 历史=' + r2.historyCount);
    assert.ok(r2.historyCount > 0, '场景2 续接应携带历史上下文');
  }

  // ===== 场景3：F5 刷新，从 URL/localStorage 恢复 conversation_id =====
  {
    const url = buildConversationUrl('http://localhost:5173/session', conversationId);
    const parsed = parseConversationIdFromUrl(url);
    const storage = {
      _m: new Map(),
      getItem: (k) => (storage._m.has(k) ? storage._m.get(k) : null),
      setItem: (k, v) => storage._m.set(k, String(v)),
      removeItem: (k) => storage._m.delete(k),
    };
    const store = createSessionStore({ storage });
    store.setCurrentConversationId(conversationId);
    console.log('[场景3] 刷新 URL=' + url + ' → 解析 conversation_id=' + parsed +
      ' localStorage 恢复=' + store.getCurrentConversationId());
    assert.equal(parsed, conversationId, '场景3 URL 应解析出 ID');
    assert.equal(store.getCurrentConversationId(), conversationId, '场景3 localStorage 应恢复 ID');

    const conv = await api.getConversation(parsed);
    console.log('[场景3] 刷新后拉取历史消息 ' + conv.messages.length + ' 条（上下文不丢）');
    assert.ok(conv.messages.length >= 2, '场景3 上下文不应丢失');
  }

  // ===== 场景4：发送消息后异步记忆提炼，不阻塞，新事实写入 user_memory =====
  {
    const t0 = Date.now();
    const r4 = await api.chat({ userId, conversationId, message: '我喜欢在院子里种花' });
    const elapsed = Date.now() - t0;
    const memBefore = await memApi.listMemories(userId);
    const memBeforeCount = (memBefore.memories || []).length;

    // 等待异步提炼完成
    await new Promise((resolve) => setTimeout(resolve, 300));
    const memAfter = await memApi.listMemories(userId);
    const memAfterList = memAfter.memories || [];
    const found = memAfterList.some(
      (m) => m.content.includes('院子') || m.content.includes('种花'),
    );
    console.log('[场景4] 请求消息="我喜欢在院子里种花" 主响应耗时=' + elapsed + 'ms');
    console.log('[场景4] 提炼前记忆 ' + memBeforeCount + ' 条 → 提炼后 ' + memAfterList.length + ' 条，命中新事实=' + found);
    assert.ok(r4.reply, '场景4 主对话应正常返回');
    assert.ok(elapsed < 2000, '场景4 主响应不应被提炼阻塞');
    assert.ok(found, '场景4 异步提炼应写入新事实');
  }

  // ===== 场景6（加固）：陈旧/越权 conversation_id → 自动回退新建，不报错 =====
  {
    const r6 = await api.chat({
      userId,
      conversationId: 'conv_stale_nonexistent',
      message: '这个会话ID已失效',
    });
    console.log(
      '[场景6] 陈旧 conversation_id → 回退新建 conversationId=' +
        r6.conversationId +
        ' 历史=' +
        r6.historyCount,
    );
    assert.ok(r6.conversationId && r6.conversationId !== 'conv_stale_nonexistent', '场景6 应回退新建会话');
    assert.equal(r6.historyCount, 0, '场景6 新会话应无历史');
  }

  // ===== 场景5：修改世界状态 → 关闭重开 → world_state 持久化加载 =====
  {
    orchestrator.worldState.set({
      key: 'scene:yard',
      kind: 'scene',
      payload: { npc: '阿禾', desc: '更新后的大院', plants: 12 },
    });
    // 新开会话（同用户）验证世界状态已更新
    const r5 = await api.chat({ userId, message: '看看现在院子什么样' });
    const ws = (r5.worldStates || []).find((w) => w.key === 'scene:yard');
    console.log('[场景5] 更新世界状态 plants=12 → 新会话加载 world_state=' + JSON.stringify(ws && ws.payload));
    assert.ok(ws && ws.payload && ws.payload.plants === 12, '场景5 新会话应加载更新后的世界状态');

    // 关闭重开 DB（模拟服务重启），验证 SQLite 持久化
    await closeServer();
    const db2 = openMemoryDatabase({ databasePath: dbPath });
    const orch2 = createMemoryOrchestrator({ db: db2, llmClient: createLlmClient({ apiKey: '' }) });
    const persisted = orch2.worldState.get('scene:yard');
    console.log('[场景5] 重启后 DB 读取 world_state=' + JSON.stringify(persisted && persisted.payload));
    assert.ok(persisted && persisted.payload && persisted.payload.plants === 12, '场景5 重启后 world_state 应持久化');
    db2.close();
  }

  console.log('\n[全链路 E2E 联调] 5 个场景全部通过 ✅');
} finally {
  await closeServer().catch(() => null);
  for (const s of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + s, { force: true });
    } catch {
      // ignore
    }
  }
}
