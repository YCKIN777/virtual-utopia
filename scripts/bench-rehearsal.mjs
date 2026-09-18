// 最终生产预演：性能采样 + 备份恢复验证（自包含，独立 DB）
import { rmSync, cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openMemoryDatabase, newId, now } from '../backend/src/memory/database.mjs';
import { createLlmClient } from '../backend/src/memory/llmClient.mjs';
import { createMemoryOrchestrator } from '../backend/src/memory/memoryOrchestrator.mjs';
import { createMemoryApp } from '../backend/src/memory/httpServer.mjs';
import { createGuardedApp } from '../backend/src/runtime/guard.js';

const dbPath = 'H:/BP2/data/bench-rehearsal.sqlite';
const PORT = 3620;
const BASE = 'http://localhost:' + PORT;
const userId = 'u_bench';

for (const s of ['', '-wal', '-shm']) { try { rmSync(dbPath + s, { force: true }); } catch {} }

const db = openMemoryDatabase({ databasePath: dbPath });
const orchestrator = createMemoryOrchestrator({ db, llmClient: createLlmClient({ apiKey: '' }) });
orchestrator.ensureUser(userId);
db.prepare('INSERT INTO user_memory (id, user_id, content, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(newId('mem'), userId, '用户偏好宋式美学风格', 'preference', 0.9, now(), now());

const memoryApp = createMemoryApp({ orchestrator });
const { app } = createGuardedApp({ service: 'bench', app: memoryApp, options: { rateLimit: { maxRequests: 10000 } } });
const server = await new Promise((res, rej) => { const s = app.listen(PORT, 'localhost'); s.once('listening', () => res(s)); s.once('error', rej); });

const call = async (path, body) => {
  const res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return res.json();
};

const close = () => new Promise((res) => { server.close(() => { try { db.close(); } catch {} res(); }); });

try {
  // 首条 chat 建会话
  const first = await call('/api/chat', { userId, message: '你好' });
  const convId = first.conversationId;

  // 性能采样：10 轮 chat
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    await call('/api/chat', { userId, conversationId: convId, message: '性能采样 ' + i });
    samples.push(Date.now() - t);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  // 异步提炼延迟
  const t = Date.now();
  await call('/api/chat', { userId, conversationId: convId, message: '我喜欢在院子里种花' });
  const respMs = Date.now() - t;
  const start = Date.now();
  let extractMs = -1;
  for (let i = 0; i < 50; i++) {
    const mem = await fetch(BASE + '/api/user/memory?userId=' + userId).then((r) => r.json());
    if ((mem.memories || []).some((m) => m.content.includes('种花') || m.content.includes('院子'))) {
      extractMs = Date.now() - start;
      break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }

  console.log('主请求响应(10轮): avg=' + avg.toFixed(1) + 'ms min=' + min + 'ms max=' + max + 'ms');
  console.log('异步提炼延迟: ' + extractMs + 'ms（主响应 ' + respMs + 'ms）');

  // 备份
  const backupDir = join('H:/BP2/data', 'backup-' + Date.now());
  mkdirSync(backupDir, { recursive: true });
  for (const s of ['', '-wal', '-shm']) {
    if (existsSync(dbPath + s)) cpSync(dbPath + s, join(backupDir, 'bench-rehearsal.sqlite' + s));
  }
  console.log('备份: 已生成一致快照（.sqlite + -wal + -shm）');

  // 恢复：复制到新目录并打开验证
  const recoverDir = 'H:/BP2/data/recover-' + Date.now();
  mkdirSync(recoverDir, { recursive: true });
  for (const s of ['', '-wal', '-shm']) {
    if (existsSync(join(backupDir, 'bench-rehearsal.sqlite' + s))) cpSync(join(backupDir, 'bench-rehearsal.sqlite' + s), join(recoverDir, 'bench-rehearsal.sqlite' + s));
  }
  const rdb = openMemoryDatabase({ databasePath: join(recoverDir, 'bench-rehearsal.sqlite') });
  const count = rdb.prepare('SELECT COUNT(*) AS c FROM user_memory').get().c;
  console.log('恢复: 恢复后记忆数=' + count);
  rdb.close();

  // 清理
  rmSync(backupDir, { recursive: true, force: true });
  rmSync(recoverDir, { recursive: true, force: true });
  console.log('备份恢复验证: ' + (count >= 1 ? '通过' : '失败'));
} finally {
  await close();
  for (const s of ['', '-wal', '-shm']) { try { rmSync(dbPath + s, { force: true }); } catch {} }
}
