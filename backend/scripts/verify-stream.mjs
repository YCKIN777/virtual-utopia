// P4 验证：SSE 流式对话 + 长记忆写入（真实认证模式：phase6 登录 → Bearer token）。
// 用法：node scripts/verify-stream.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const BASE = 'http://localhost:3000';
const PHASE6_BASE = 'http://localhost:3400';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'utopia2026';

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

  return payload.token;
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

const run = async () => {
  const token = await login();
  const conversationId = `stream-verify-${Date.now()}`;
  const body = {
    conversationId,
    sceneId: 'yard',
    // 用不命中审批的查询工具（plot_lookup）验证完整流式 + 长记忆落库；
    // 命中审批的问题会停在 approval_pending（见 verify-hitl.mjs）。
    input: { content: '帮我查一下 39 号宅院现在是哪位居民在住，风格是什么样的？' },
  };

  const events = [];
  const response = await fetch(`${BASE}/api/scene/route/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  console.log('status:', response.status);

  await parseSse(response, {
    status: (data) => {
      events.push({ type: 'status', data });
      console.log('status:', JSON.stringify(data));
    },
    reply_chunk: (data) => {
      events.push({ type: 'reply_chunk', data });
    },
    done: (data) => {
      events.push({ type: 'done', data });
      console.log(
        'done: fallback=%s replyLen=%d',
        data.payload?.meta?.fallback,
        data.payload?.result?.reply?.length,
      );
    },
    error: (data) => {
      events.push({ type: 'error', data });
      console.log('error:', JSON.stringify(data));
    },
  });

  const chunks = events
    .filter((e) => e.type === 'reply_chunk')
    .map((e) => e.data.token)
    .join('');
  console.log('tokenStreamLen:', chunks.length);
  console.log('fullReply:', events.find((e) => e.type === 'done')?.data?.payload?.result?.reply);
  console.log('eventCounts:', JSON.stringify({
    status: events.filter((e) => e.type === 'status').length,
    reply_chunk: events.filter((e) => e.type === 'reply_chunk').length,
  }));
  console.log('conversationId:', conversationId);

  // 等异步记忆写入完成
  await new Promise((resolve) => setTimeout(resolve, 1500));
  console.log('VERIFY_STREAM_DONE');
};

run().catch((error) => {
  console.error('verify failed:', error);
  process.exitCode = 1;
});
