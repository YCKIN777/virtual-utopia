// scripts/verify-hitl.mjs
// P4 HITL（KIN 审批）E2E 验证 —— 真实认证模式（phase6 登录 → Bearer token）。
// 依赖运行中的 phase5(3300)/phase6(3400)/scene(3000) 服务。
// 前置：scene 服务需以 AI_APPROVAL_TOOLS=quota_overview,guestbook_write 启动
//       （框架验证用查询类工具触发 interrupt，避免依赖模型对写入类工具的谨慎行为）。
// 场景 A：admin 查询名额（quota_overview 命中审批）→ pending_approval → resume(approved:true) → 真实数据。
// 场景 B：新 thread → resume(approved:false) → 拒绝回复且不执行。
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

console.log('场景 A：admin 查询名额 → pending_approval → resume(approved:true) → 真实数据');
{
  const conversationId = `hitl-verify-${Date.now()}`;
  const events = await readSse({
    sceneId: 'yard',
    conversationId,
    input: { content: '帮我查一下现在乌托邦的访客名额还剩多少？' },
  });

  const pending = events.find(
    (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
  );
  assert(!!pending, '收到 approval_pending 状态事件');
  assert(
    pending.payload.approval?.type === 'kin_approval',
    'approval.type === kin_approval',
  );
  assert(
    (pending.payload.approval?.toolCalls ?? []).some(
      (call) => call.name === 'quota_overview',
    ),
    '审批请求包含 quota_overview 工具调用',
  );

  const done = events.find((e) => e.event === 'done');
  assert(!!done, '收到 done 事件');
  assert(
    done.payload?.payload?.status === 'pending_approval',
    'done.payload.status === pending_approval',
  );
  assert(
    done.payload?.payload?.conversationId === conversationId,
    'done 携带 conversationId',
  );

  const resume = await postJson('/api/scene/route/resume', {
    conversationId,
    decision: { approved: true, reason: 'KIN 批准' },
  });
  assert(!!resume?.result?.reply, 'resume 返回完整回复');
  console.log(
    `  meta: ${JSON.stringify(resume?.meta).slice(0, 300)}`,
  );
  assert(resume.meta?.fallback === false, 'resume 无 fallback（真实数据）');
  assert(/名额/.test(resume.result.reply), '回复包含名额数据');
  console.log(`  reply: ${resume.result.reply.slice(0, 80)}…`);
}

console.log('场景 B：新 thread → resume(approved:false) → 拒绝回复且不执行');
{
  const beforeCount = null; // 查询类工具无写入，仅验证拒绝路由

  // 模型对同一查询有时直接文本作答（未发起工具调用），重试直至触发审批
  let events = null;
  let conversationIdB = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    conversationIdB = `hitl-verify-b-${Date.now()}-${attempt}`;
    events = await readSse({
      sceneId: 'yard',
      conversationId: conversationIdB,
      input: { content: '帮我查一下现在乌托邦的访客名额还剩多少？' },
    });

    if (
      events.some(
        (e) => e.event === 'status' && e.payload?.phase === 'approval_pending',
      )
    ) {
      break;
    }
  }

  const done = events.find((e) => e.event === 'done');
  assert(
    done?.payload?.payload?.status === 'pending_approval',
    '场景 B 进入 pending_approval',
  );

  const resume = await postJson('/api/scene/route/resume', {
    conversationId: conversationIdB,
    decision: { approved: false, reason: 'KIN 拒绝' },
  });
  assert(!!resume?.result?.reply, '拒绝后返回回复');
  assert(/未获批准|没有执行/.test(resume.result.reply), '回复表明操作被拒绝未执行');
  console.log(`  reply: ${resume.result.reply.slice(0, 80)}…`);
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
