// phase5 CORS 收紧 + 全链路最终验证
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = [];
const newPw = readFileSync('H:/BP2/admin-new-password.txt', 'utf8').trim();
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// 1. phase6 登录（走 phase5 服务调用，无 Origin）→ 应 200
try {
  const r = await fetch('http://localhost:3400/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: newPw }),
    signal: AbortSignal.timeout(10000),
  });
  out.push(`phase6 登录(无Origin): HTTP ${r.status}`);
} catch (e) { out.push('phase6 err: ' + String(e.message).slice(0, 100)); }
// 2. phase5 直连登录（无 Origin）→ 200
try {
  const r = await fetch('http://localhost:3300/api/phase5/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: sha256(newPw) }),
    signal: AbortSignal.timeout(10000),
  });
  out.push(`phase5 登录(无Origin): HTTP ${r.status}`);
} catch (e) { out.push('phase5 err: ' + String(e.message).slice(0, 100)); }
// 3. phase5 带外部 Origin（如恶意站）→ 应被拒
try {
  const r = await fetch('http://localhost:3300/api/phase5/health', {
    headers: { Origin: 'https://evil.example.com' },
    signal: AbortSignal.timeout(10000),
  });
  out.push(`phase5 外部Origin health: HTTP ${r.status}（期望非200）`);
} catch (e) { out.push('phase5 外部Origin: 连接/拒绝 ' + String(e.message).slice(0, 80)); }
// 4. 全链路（nginx 80 登录，公网 Origin）
try {
  const r = await fetch('http://localhost/phase6-api/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://36087f0f.r2.cpolar.top' },
    body: JSON.stringify({ username: 'admin', password: newPw }),
    signal: AbortSignal.timeout(10000),
  });
  out.push(`nginx 80 登录(公网Origin): HTTP ${r.status}`);
} catch (e) { out.push('nginx err: ' + String(e.message).slice(0, 100)); }
// 5. scene
try {
  const r = await fetch('http://localhost:3000/api/scenes', { signal: AbortSignal.timeout(10000) });
  out.push(`scene /api/scenes: HTTP ${r.status}`);
} catch (e) { out.push('scene err: ' + String(e.message).slice(0, 100)); }
writeFileSync('H:/BP2/final-chain-check.txt', out.join('\n'), 'utf8');
