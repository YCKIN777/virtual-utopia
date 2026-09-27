import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = [];
try {
  const r = execFileSync('H:/BP2/cpolar/app/cpolar/cpolar.exe', ['version'], { encoding: 'utf8', timeout: 15000 });
  out.push('version OK: ' + r.trim().slice(0, 200));
} catch (e) {
  out.push('version ERR: ' + String(e.message).slice(0, 200));
  if (e.stdout) out.push('stdout: ' + e.stdout.slice(0, 100));
  if (e.stderr) out.push('stderr: ' + e.stderr.slice(0, 100));
}
writeFileSync('H:/BP2/cpolar-check.txt', out.join('\n'), 'utf8');
