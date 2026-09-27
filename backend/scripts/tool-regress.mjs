// 工具轮回归：输入触发 guestbook_write，检查 SSE 流（tool_calling + 最终流式 reply）
import { writeFileSync } from 'node:fs';
const P6 = 'http://localhost:3400';
const SC = 'http://localhost:3000';
const login = await fetch(P6 + '/api/phase6/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
}).then((r) => r.json());
const r = await fetch(SC + '/api/scene/route/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
  body: JSON.stringify({
    sceneId: 'yard',
    conversationId: 'tool-regress-' + Date.now(),
    input: { content: '帮我在留言簿写一句：周末来大院喝茶，欢迎串门' },
  }),
});
const text = await r.text();
const events = text.split('\n\n').filter((b) => b.includes('event: '));
const out = ['事件总数: ' + events.length];
let chunkCount = 0;
let firstToken = '';
for (const ev of events) {
  const line = ev.split('\n')[0];
  const dataLine = ev.split('\n').find((l) => l.startsWith('data: ')) || '';
  out.push(line + ' | ' + dataLine.slice(0, 100));
  if (line.includes('reply_chunk')) {
    chunkCount++;
    if (!firstToken) firstToken = dataLine.slice(0, 80);
  }
}
out.push('reply_chunk 次数: ' + chunkCount);
out.push('首 reply_chunk: ' + firstToken);
out.push('工具调用验证(含 tool_calling): ' + text.includes('tool_calling'));
writeFileSync('H:/BP2/tool-out.txt', out.join('\n'), 'utf8');
