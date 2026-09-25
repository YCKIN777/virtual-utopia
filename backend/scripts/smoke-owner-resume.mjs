// 临时冒烟：app 级装配验证 —— conversationRegistry 注入 resume 路由 + sceneAuth 游客放行。
import { createApp } from '../src/app.js';
import { createConversationRegistry } from '../src/services/conversationRegistry.js';

const registry = createConversationRegistry();
const app = createApp({
  orchestrator: {
    async handle() {
      return { ok: true };
    },
    async resume(body) {
      return { ok: true, conversationId: body.conversationId };
    },
  },
  conversationRegistry: registry,
});

const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const results = [];

// 0. 模拟 handle 阶段注册 owner（editor 7 发起会话 conv-7）
registry.register('conv-7', { userId: 7, role: 'editor', username: 'resident7' });

// 1. 游客（无 token，sceneAuth 放行）→ resume 拒绝：403
let response = await fetch(`${base}/api/scene/route/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversationId: 'conv-7', decision: { approved: true } }),
});
let payload = await response.json().catch(() => null);
results.push([
  'guest blocked',
  response.status === 403 && payload?.error === 'FORBIDDEN',
  `status=${response.status} error=${payload?.error}`,
]);

// 2. 缺 conversationId → 400（装配链路可达性确认）
response = await fetch(`${base}/api/scene/route/resume`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ decision: { approved: true } }),
});
payload = await response.json().catch(() => null);
results.push([
  'missing conversationId',
  response.status === 400 && payload?.error === 'INVALID_REQUEST',
  `status=${response.status} error=${payload?.error}`,
]);

// 3. 无效 token → sceneAuth 401（认证服务可达性——phase6 未起场景返回 503，此处确认非 404 装配错误）
response = await fetch(`${base}/api/scene/route/resume`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer invalid-token',
  },
  body: JSON.stringify({ conversationId: 'conv-7', decision: { approved: true } }),
});
results.push([
  'invalid token not-404',
  response.status !== 404,
  `status=${response.status}`,
]);

for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

server.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
