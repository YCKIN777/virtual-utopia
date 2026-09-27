// 延迟基线实测：TTFT（首 token 到达）与总耗时（done）
import { writeFileSync } from 'node:fs';
const P6 = 'http://localhost:3400';
const SC = 'http://localhost:3000';
const login = await fetch(P6 + '/api/phase6/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
}).then((r) => r.json());

const t0 = Date.now();
const r = await fetch(SC + '/api/scene/route/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
  body: JSON.stringify({
    sceneId: 'yard',
    conversationId: 'latency-baseline-' + Date.now(),
    input: { content: '你好，介绍一下大院' },
  }),
});
const tConnect = Date.now();
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = '', ttft = null, doneAt = null, statusAt = null, chunks = 0;
let firstChunkText = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) !== -1) {
    const block = buf.slice(0, i);
    buf = buf.slice(i + 2);
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        const ev = line.slice(7);
        if (ev === 'status' && !statusAt) statusAt = Date.now();
      } else if (line.startsWith('data: ') && ttft === null) {
        try {
          const d = JSON.parse(line.slice(6));
          if (d.token) { ttft = Date.now(); firstChunkText = d.token.slice(0, 40); }
          if (d.token) chunks++;
        } catch {}
      }
    }
  }
}
doneAt = Date.now();
const lines = [
  '连接耗时: ' + (tConnect - t0) + ' ms',
  'status(thinking) 到达: ' + (statusAt ? statusAt - t0 : 'N/A') + ' ms',
  'TTFT(首个 reply_chunk): ' + (ttft ? ttft - t0 : 'N/A') + ' ms',
  '总耗时(done): ' + (doneAt - t0) + ' ms',
  '首 token 内容: ' + firstChunkText,
  'reply_chunk 次数: ' + chunks,
];
writeFileSync('H:/BP2/lat-out.txt', lines.join('\n'), 'utf8');
