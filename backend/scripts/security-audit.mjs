// 安全现状盘点：.env 敏感项 + phase5/6 改密能力
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const out = [];
const p = 'H:/BP2/backend/.env';
const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
out.push('--- .env 敏感行（脱敏）---');
for (const line of t.split(/\r?\n/)) {
  const m = line.match(/^(PHASE5_AUTH_SECRET|PHASE5_SERVICE_TOKEN|PHASE5_BOOTSTRAP_ADMIN_PASSWORD|CORS_ORIGIN|PHASE6_ALLOWED_ORIGINS)\s*=\s*(.*)$/);
  if (m) {
    const v = m[2].replace(/sk-[A-Za-z0-9]+/g, 'sk-***');
    out.push(`${m[1]}=${v.length > 60 ? v.slice(0, 20) + '...(' + v.length + ' chars)' : v}`);
  }
}
// phase5 改密端点搜索
try {
  const r = execSync('node -e "const s=require(\'fs\').readFileSync(\'H:/BP2/backend/src/phase5/routes.js\',\'utf8\'); const m=s.match(/\\/auth\\/[a-z-]+/gi); console.log([...new Set(m||[])].join(\' \'))"', { encoding: 'utf8', timeout: 20000 });
  out.push('phase5 auth 路由: ' + r.trim());
} catch (e) {
  out.push('phase5 路由扫描 err: ' + String(e.message).slice(0, 100));
}
writeFileSync('H:/BP2/security-audit.txt', out.join('\n'), 'utf8');
