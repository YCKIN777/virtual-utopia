// 完整 SSE 事件流 dump：确认实际走了哪个路径
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
    conversationId: 'sse-dump-' + Date.now(),
    input: { content: '你好' },
  }),
});
const text = await r.text();
// 打印每个事件的首行
const events = text.split('\n\n').filter((b) => b.includes('event: '));
for (const ev of events) {
  const line = ev.split('\n')[0];
  const dataLine = ev.split('\n').find((l) => l.startsWith('data: ')) || '';
  console.log(line, '|', dataLine.slice(0, 90));
}
console.log('事件总数:', events.length, '| 含 reply_chunk:', text.includes('reply_chunk'));

// 输出到文件（PowerShell stdout 吞字规避）
import { writeFileSync } from 'node:fs';
const lines = [];
lines.push('事件总数: ' + events.length + ' | 含 reply_chunk: ' + text.includes('reply_chunk'));
for (const ev of events) {
  const line = ev.split('\n')[0];
  const dataLine = ev.split('\n').find((l) => l.startsWith('data: ')) || '';
  lines.push(line + ' | ' + dataLine.slice(0, 120));
}
writeFileSync('H:/BP2/dump-out.txt', lines.join('\n'), 'utf8');
