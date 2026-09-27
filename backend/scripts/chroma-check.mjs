// Chroma 鉴权验证：无 token 401 / 有 token 200 + scene 全链路
import { writeFileSync, readFileSync } from 'node:fs';
const out = [];
const env = readFileSync('H:/BP2/backend/.env', 'utf8');
const token = (env.match(/^CHROMA_AUTH_TOKEN=(.*)$/m) || [])[1] || '';
// 1. 无 token heartbeat
try {
  const r = await fetch('http://localhost:8000/api/v2/heartbeat', { signal: AbortSignal.timeout(8000) });
  out.push(`chroma 无 token heartbeat: HTTP ${r.status}`);
} catch (e) {
  out.push('chroma 无 token: ' + (e.cause?.code || e.name));
}
// 2. 有 token heartbeat
try {
  const r = await fetch('http://localhost:8000/api/v2/heartbeat', {
    headers: { 'X-Chroma-Token': token },
    signal: AbortSignal.timeout(8000),
  });
  out.push(`chroma 带 token heartbeat: HTTP ${r.status}`);
} catch (e) {
  out.push('chroma 带 token err: ' + (e.cause?.code || e.name));
}
// 3. scene RAG heartbeat（checkVectorStore）
try {
  const r = await fetch('http://localhost:3000/api/rag/health', { signal: AbortSignal.timeout(8000) });
  const t = await r.text();
  out.push(`scene /api/rag/health: HTTP ${r.status} | ${t.slice(0, 150)}`);
} catch (e) {
  out.push('scene rag health err: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 100));
}
// 4. scene 全链路
try {
  const r = await fetch('http://localhost:3000/api/scenes', { signal: AbortSignal.timeout(8000) });
  out.push(`scene /api/scenes: HTTP ${r.status}`);
} catch (e) {
  out.push('scene scenes err: ' + (e.cause?.code || e.name));
}
writeFileSync('H:/BP2/chroma-check.txt', out.join('\n'), 'utf8');
