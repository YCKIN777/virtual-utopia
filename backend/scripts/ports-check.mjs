// 端口收敛验证：宿主不可达 + nginx 80 全链路
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = [];
const newPw = readFileSync('H:/BP2/admin-new-password.txt', 'utf8').trim();
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// 1. 宿主直连 3300/3400/3000 应不可达
for (const port of [3300, 3400, 3000, 8000]) {
  try {
    const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(3000) });
    out.push(`宿主 ${port}: 仍可达 HTTP ${r.status}（异常！）`);
  } catch {
    out.push(`宿主 ${port}: 不可达 ✓`);
  }
}
// 2. nginx 80 全链路（登录 + scene）
try {
  const r = await fetch('http://localhost/phase6-api/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://36087f0f.r2.cpolar.top' },
    body: JSON.stringify({ username: 'admin', password: newPw }),
    signal: AbortSignal.timeout(10000),
  });
  out.push(`nginx 80 登录(公网Origin): HTTP ${r.status}`);
} catch (e) { out.push('nginx 登录 err: ' + String(e.message).slice(0, 100)); }
try {
  const r = await fetch('http://localhost/scene-api/api/scenes', { signal: AbortSignal.timeout(10000) });
  out.push(`nginx 80 scene /api/scenes: HTTP ${r.status}`);
} catch (e) { out.push('nginx scene err: ' + String(e.message).slice(0, 100)); }
writeFileSync('H:/BP2/ports-check.txt', out.join('\n'), 'utf8');
