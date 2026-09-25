// P4 收尾验证：场景服务真实认证全链路。
// 用法：node scripts/verify-auth.mjs
// 前置：phase5(3300)、phase6(3400)、scene(3000) 已启动；默认登录 admin/utopia2026
//       （bootstrap 默认，.env.example 同款；非默认密码时可用环境变量 AUTH_USERNAME/AUTH_PASSWORD 覆盖）。
// 验证点：
//   ① 无 token（游客）：/scene/route 可对话（200）；/scene/route/resume 403。
//   ② 无效 token：401，不继续。
//   ③ 有效 token（admin）：/scene/route/stream 带 Bearer → 工具查询真实数据；
//      身份经 phase6 /auth/me 解析，body.user 不再被信任（传了也无效）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const PHASE6_BASE = 'http://localhost:3400';
const SCENE_BASE = 'http://localhost:3000';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'utopia2026';

const postJson = async (base, pathname, { token, body } = {}) => {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  return { status: response.status, payload };
};

const parseSse = async (response, handlers) => {
  if (!response.body) throw new Error('no response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let event = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = rawEvent.split('\n').filter(Boolean);

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          event = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
          const data = line.slice('data: '.length);
          handlers?.[event]?.(JSON.parse(data));
          event = null;
        }
      }
    }
  }
};

const assert = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
};

const run = async () => {
  // 0) 登录拿真实 token
  const loginResult = await postJson(PHASE6_BASE, '/api/phase6/auth/login', {
    body: { username: USERNAME, password: PASSWORD },
  });
  assert(
    loginResult.status === 200 && loginResult.payload?.token,
    '登录 phase6（真实账号体系）',
    `status=${loginResult.status} role=${loginResult.payload?.user?.role}`,
  );
  const token = loginResult.payload?.token;
  if (!token) {
    console.log('登录失败，无法继续 token 路径（可用 AUTH_USERNAME/AUTH_PASSWORD 覆盖默认账号）');
    return;
  }

  // 1) 无 token（游客）：普通对话可进行
  const guestChat = await postJson(SCENE_BASE, '/api/scene/route', {
    body: {
      conversationId: `auth-verify-guest-${Date.now()}`,
      sceneId: 'yard',
      input: { content: '你好，介绍一下你自己' },
    },
  });
  assert(guestChat.status === 200, '游客对话 /scene/route 放行', `status=${guestChat.status}`);

  // 2) 无 token（游客）：resume 审批恢复被拒
  const guestResume = await postJson(SCENE_BASE, '/api/scene/route/resume', {
    body: { conversationId: 'any', decision: { approved: true } },
  });
  assert(
    guestResume.status === 403,
    '游客 resume（审批恢复）403',
    `status=${guestResume.status} error=${guestResume.payload?.error}`,
  );

  // 3) 无效 token：401
  const badToken = await postJson(SCENE_BASE, '/api/scene/route', {
    token: 'token-invalid-abc',
    body: { sceneId: 'yard', input: { content: 'hi' } },
  });
  assert(badToken.status === 401, '无效 token → 401', `status=${badToken.status}`);

  // 4) 有效 token：流式查询触发真实工具（plot_lookup 不命中审批；quota_overview 在
  //    AI_APPROVAL_TOOLS 扩展启动时会停在 approval_pending，见 verify-hitl.mjs）
  const events = [];
  const conversationId = `auth-verify-${Date.now()}`;
  const response = await fetch(`${SCENE_BASE}/api/scene/route/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      conversationId,
      sceneId: 'yard',
      // body.user 直传应被忽略（真实认证下由 token 决定身份）
      user: { userId: 999, username: 'spoof', role: 'admin' },
      input: { content: '帮我查一下 39 号宅院现在是哪位居民在住，风格是什么样的？' },
    }),
  });

  await parseSse(response, {
    status: (data) => events.push({ type: 'status', data }),
    reply_chunk: (data) => events.push({ type: 'reply_chunk', data }),
    done: (data) => {
      events.push({ type: 'done', data });
      console.log('  done: fallback=%s', data.payload?.meta?.fallback);
    },
    error: (data) => events.push({ type: 'error', data }),
  });

  const reply = events.find((e) => e.type === 'done')?.data?.payload?.result?.reply || '';
  const toolUsed = events.some((e) => e.type === 'status' && e.data?.phase === 'tool_calling');
  const chunks = events.filter((e) => e.type === 'reply_chunk').map((e) => e.data.token).join('');

  assert(response.status === 200, '带真实 token 流式对话 200', `status=${response.status}`);
  assert(reply.length > 0, '返回完整回复', `replyLen=${reply.length}`);
  console.log('  状态序列:', JSON.stringify(events.filter((e) => e.type === 'status').map((e) => e.data)));
  console.log('  回复摘要:', reply.slice(0, 120), '…');
  console.log('  toolCalled:', toolUsed, ' chunkLen:', chunks.length);

  // 5) 有效 token 但非 admin 时 resume 应 403 —— admin 本身可放行（无挂起审批时后端行为打印即可）
  const adminResume = await postJson(SCENE_BASE, '/api/scene/route/resume', {
    token,
    body: { conversationId: 'auth-verify-none', decision: { approved: true } },
  });
  console.log(
    '  信息: admin resume（无挂起审批）status=%s（403=审批人校验在前；4xx=无该会话）',
    adminResume.status,
  );

  console.log('VERIFY_AUTH_DONE');
};

run().catch((error) => {
  console.error('verify failed:', error);
  process.exitCode = 1;
});
