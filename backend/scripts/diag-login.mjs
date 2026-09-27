// 诊断登录失败：探测各端口 + 直接调 phase6 登录
import { writeFileSync } from 'node:fs';
const out = [];
for (const [name, port] of [['scene', 3000], ['phase6', 3400], ['phase5', 3300], ['chroma', 8000], ['nginx', 80]]) {
  try {
    const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    out.push(`${name}(${port}): HTTP ${r.status}`);
  } catch (e) {
    out.push(`${name}(${port}): 不可连 (${e.cause?.code || e.name})`);
  }
}
// 直接调 phase6 登录（复现 upstream 错误）
try {
  const r = await fetch('http://localhost:3400/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
    signal: AbortSignal.timeout(8000),
  });
  const t = await r.text();
  out.push(`phase6 登录: HTTP ${r.status} | ${t.slice(0, 200)}`);
} catch (e) {
  out.push(`phase6 登录异常: ${e.cause?.code || e.name} ${String(e.message).slice(0, 120)}`);
}
writeFileSync('H:/BP2/diag-out.txt', out.join('\n'), 'utf8');
