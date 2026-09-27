// 验证 CORS：带公网 Origin 请求 phase6 与 scene
import { writeFileSync } from 'node:fs';
const out = [];
const origin = 'https://36087f0f.r2.cpolar.top';
// phase6 登录（公网 Origin）
try {
  const r = await fetch('http://localhost:3400/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
    signal: AbortSignal.timeout(8000),
  });
  const t = await r.text();
  out.push(`phase6 登录 (Origin=${origin}): HTTP ${r.status} | ${t.slice(0, 80)}`);
} catch (e) {
  out.push('phase6 登录异常: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 120));
}
// scene /api/scenes（公网 Origin）
try {
  const r = await fetch('http://localhost:3000/api/scenes', {
    headers: { Origin: origin },
    signal: AbortSignal.timeout(8000),
  });
  const t = await r.text();
  out.push(`scene /api/scenes: HTTP ${r.status} | ${t.slice(0, 120)}`);
} catch (e) {
  out.push('scene 异常: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 120));
}
// 公网 URL 端到端（经 nginx + cpolar 不适用本地；直测 nginx 80 带公网 Origin）
try {
  const r = await fetch('http://localhost/phase6-api/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
    signal: AbortSignal.timeout(8000),
  });
  const t = await r.text();
  out.push(`nginx 80 登录 (Origin=${origin}): HTTP ${r.status} | ${t.slice(0, 80)}`);
} catch (e) {
  out.push('nginx 80 登录异常: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 120));
}
writeFileSync('H:/BP2/cors-check.txt', out.join('\n'), 'utf8');
