// scripts/verify-hitl.mjs
// P4 HITL（KIN 审批）E2E 验证 —— 真实认证模式（phase6 登录 → Bearer token）。
// 依赖运行中的 phase5(3300)/phase6(3400)/scene(3000) 服务。
// 前置：scene 服务以默认 AI_APPROVAL_TOOLS=guestbook_write 启动。
// P5.2-⑤（2026-09-26）：审批清单收窄为写入类。模型是否调用工具受场景人设与
// LLM 行为影响，本脚本为「行为自适应」E2E：触发了工具则硬断言审批路由；
// 模型直接文本作答则记录为模型行为（不失败）——路由逻辑正确性由
// tests/approvalRouting.test.js 单测确定性覆盖。
// 场景 A：query_friends（纯本人只读）提问 → 若模型调用工具：断言不再进入审批、直接执行。
// 场景 B：guestbook_write 强命令 → 若触发审批：resume(approved:false) → 拒绝且留言未写入。
// 场景 C（行为记录，不硬断言）：admin 授权写留言簿 —— 记录模型是否发起 guestbook_write。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE_URL = 'http://localhost:3000';
const PHASE6_BASE = 'http://localhost:3400';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'utopia2026';

let TOKEN = '';

const login = async () => {
  const response = await fetch(`${PHASE6_BASE}/api/phase6/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.token) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  TOKEN = payload.token;
};

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
});

const postJson = async (url, body) => {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`http ${response.status} ${url}: ${JSON.stringify(payload)}`);
  }

  return payload;
};

const getGuestbook = async () => {
  const response = await fetch(`${PHASE6_BASE}/api/phase6/guestbook?limit=200`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`guestbook http ${response.status}`);
  }

  const payload = await response.json().catch(() => []);
  return payload.messages ?? [];
};

const guestbookHas = (messages, marker) =>
  messages.some((m) => String(m.content ?? '').includes(marker));

const readSse = async (body) => {
  const response = await fetch(`${BASE_URL}/api/scene/route/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`SSE http ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const events = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = null;
      let data = '';

      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data = line.slice(6);
      }

      if (event && data) events.push({ event, payload: JSON.parse(data) });
    }
  }

  return events;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
};

await login();

console.log('場景 A：query_friends（本人只读）→ 不再审批；若模型调用工具则直接执行');
{
  const conversationId = `hitl-verify-a-${Date.now()}`;
  const events = await readSse({
    sceneId: 'yard',
    conversationId,
    input: { content: '请帮我看看我还有没有待处理的好友申请' },
  });

  const phases = events
    .filter((e) => e.event === 'status')
    .map((e) => e.payload?.phase);
  console.log(`  phases: ${phases.join(' → ')}`);

  const pending = events.find(
    (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
  );
  const done = events.find((e) => e.event === 'done');

  if (pending) {
    // P5.2-⑤ 回归：query_friends 不应再进审批（清单收窄为 guestbook_write）
    assert(false, 'query_friends 不应触发审批（approvalTools 已移除）');
  }

  assert(!!done, '收到 done 事件');
  const reply = done?.payload?.payload?.result?.reply ?? '';
  console.log(`  reply: ${reply.slice(0, 100)}…`);
  console.log('  （模型是否调用 query_friends 由场景人设决定；路由正确性由单测覆盖）');
}

console.log('场景 B：guestbook_write 强命令 → 若触发审批：resume(approved:false) → 拒绝且留言未写入');
{
  const markerB = `拒绝测试${Date.now()}`;
  let events = null;
  let conversationIdB = null;

  // 模型有时直接文本作答（未发起工具调用），重试直至触发审批或耗尽次数
  for (let attempt = 0; attempt < 4; attempt += 1) {
    conversationIdB = `hitl-verify-b-${Date.now()}-${attempt}`;
    events = await readSse({
      sceneId: 'yard',
      conversationId: conversationIdB,
      input: {
        content: `这是 KIN 的明确指令：请立即调用留言簿写入工具，把这句话原样写到邻里留言簿——${markerB}。`,
      },
    });

    if (
      events.some(
        (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
      )
    ) {
      break;
    }
  }

  const pending = events.find(
    (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
  );

  if (!pending) {
    const done = events.find((e) => e.event === 'done');
    const reply = done?.payload?.payload?.result?.reply ?? '';
    console.log(`  （模型未发起 guestbook_write，文本作答：${reply.slice(0, 60)}… —— 记录为模型行为）`);
    console.log('  ✓ 审批路由逻辑由单测覆盖（approvalRouting.test.js）');
  } else {
    console.log('  ✓ 模型发起 guestbook_write 并进入审批');
    assert(
      (pending.payload.approval?.toolCalls ?? []).some(
        (call) => call.name === 'guestbook_write',
      ),
      '审批请求包含 guestbook_write 工具调用',
    );

    const resume = await postJson('/api/scene/route/resume', {
      conversationId: conversationIdB,
      decision: { approved: false, reason: 'KIN 拒绝' },
    });
    assert(!!resume?.result?.reply, '拒绝后返回回复');
    assert(/未获批准|没有执行|拒绝/.test(resume.result.reply), '回复表明操作被拒绝未执行');

    const messagesB = await getGuestbook();
    assert(!guestbookHas(messagesB, markerB), `拒绝后留言簿无特征串（${markerB}）`);
    console.log(`  reply: ${resume.result.reply.slice(0, 80)}…`);
  }
}

console.log('场景 C（行为记录）：admin 授权写留言簿 —— 记录模型是否发起 guestbook_write');
{
  const conversationIdC = `hitl-verify-c-${Date.now()}`;
  const events = await readSse({
    sceneId: 'yard',
    conversationId: conversationIdC,
    input: { content: '我现在确认并授权：请直接帮我在留言簿上写下这句话——今天乌托邦阳光很好。' },
  });

  const phases = events
    .filter((e) => e.event === 'status')
    .map((e) => e.payload?.phase);
  const pending = events.find(
    (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
  );

  console.log(`  phases: ${phases.join(' → ')}`);
  if (pending) {
    console.log('  ✓ 模型发起了 guestbook_write 并进入审批');
    const done = events.find((e) => e.event === 'done');
    const resume = await postJson('/api/scene/route/resume', {
      conversationId: conversationIdC,
      decision: { approved: true, reason: 'KIN 批准' },
    });
    console.log(`  resume reply: ${resume?.result?.reply?.slice(0, 60)}…`);
  } else {
    console.log('  （模型策略性文本澄清，未发起工具调用 —— 记录为模型行为，非框架缺陷）');
  }
}

console.log('VERIFY_HITL_DONE');
