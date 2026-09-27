// 检查并追加 CORS 配置到 backend/.env（追加行，保留原内容）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const p = 'H:/BP2/backend/.env';
let t = existsSync(p) ? readFileSync(p, 'utf8') : '';
const lines = t.split(/\r?\n/);
const out = [];
// 已有 CORS_ORIGIN 行则更新，否则追加
const corsLine = 'CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,https://36087f0f.r2.cpolar.top';
const corsIdx = lines.findIndex((l) => /^CORS_ORIGIN\s*=/.test(l));
if (corsIdx >= 0) {
  lines[corsIdx] = corsLine;
  out.push('更新已有 CORS_ORIGIN 行 (line ' + (corsIdx + 1) + ')');
} else {
  lines.push(corsLine);
  out.push('追加 CORS_ORIGIN 行');
}
const pwLine = 'PHASE6_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,https://36087f0f.r2.cpolar.top';
const pwIdx = lines.findIndex((l) => /^PHASE6_ALLOWED_ORIGINS\s*=/.test(l));
if (pwIdx >= 0) {
  lines[pwIdx] = pwLine;
  out.push('更新已有 PHASE6_ALLOWED_ORIGINS');
} else {
  lines.push(pwLine);
  out.push('追加 PHASE6_ALLOWED_ORIGINS');
}
writeFileSync(p, lines.join('\n') + '\n', 'utf8');
out.push('写入完成');
writeFileSync('H:/BP2/env-patch.txt', out.join('\n'), 'utf8');
