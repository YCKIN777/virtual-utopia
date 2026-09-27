// 验证公网地址可达性
import { writeFileSync } from 'node:fs';
const out = [];
const url = 'https://36087f0f.r2.cpolar.top';
try {
  const r = await fetch(url + '/', { signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  out.push(`公网首页: HTTP ${r.status}`);
  out.push('含虚拟乌托邦标记: ' + (t.includes('虚拟乌托邦') || t.includes('virtual-utopia') || t.includes('world')));
  out.push('首 300 字符: ' + t.replace(/\s+/g, ' ').slice(0, 300));
} catch (e) {
  out.push('公网首页异常: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 150));
}
// API 探活（登录 + scene）
try {
  const login = await fetch('https://36087f0f.r2.cpolar.top/phase6-api/api/phase6/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'utopia2026' }),
    signal: AbortSignal.timeout(20000),
  });
  const lt = await login.text();
  out.push(`公网登录: HTTP ${login.status} | ${lt.slice(0, 120)}`);
} catch (e) {
  out.push('公网登录异常: ' + (e.cause?.code || e.name) + ' ' + String(e.message).slice(0, 120));
}
writeFileSync('H:/BP2/public-url-check.txt', out.join('\n'), 'utf8');
