import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = [];
const exe = 'H:/BP2/cpolar/app/cpolar/cpolar.exe';
try {
  const r = execFileSync(exe, ['--help'], { encoding: 'utf8', timeout: 15000 });
  out.push(r.trim().slice(0, 1200));
} catch (e) {
  out.push('ERR: ' + String(e.message).slice(0, 200));
  if (e.stdout) out.push('stdout: ' + e.stdout.slice(0, 500));
  if (e.stderr) out.push('stderr: ' + e.stderr.slice(0, 500));
}
writeFileSync('H:/BP2/cpolar-token.txt', out.join('\n'), 'utf8');
