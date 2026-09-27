import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const out = [];
await new Promise((r) => setTimeout(r, 3000));
for (const f of ['H:/BP2/cpolar-run.log', 'H:/BP2/cpolar-tunnel.log', 'H:/BP2/cpolar-tunnel.err']) {
  if (existsSync(f)) {
    const t = readFileSync(f, 'utf8');
    if (t.trim()) {
      out.push('--- ' + f + ' ---');
      out.push(t.split('\n').slice(-40).join('\n'));
    }
  }
}
if (out.length === 0) out.push('所有日志为空');
writeFileSync('H:/BP2/cpolar-tunnel-result.txt', out.join('\n'), 'utf8');
