// 本地验证 admin hash 对应哪种口令口径
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyPassword } from '../src/phase5/security.js';
const out = [];
const dk = 'C:/Users/Administrator/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const code = [
  "const Database=require('better-sqlite3');",
  "const db=new Database('/data/phase5/virtual_utopia_phase5.sqlite',{readonly:true});",
  "const row=db.prepare('SELECT password_hash FROM users WHERE username=?').get('admin');",
  "console.log(row.password_hash);",
].join(' ');
let hash = '';
try {
  hash = execFileSync(dk, ['exec', 'virtual-utopia-phase5', 'node', '-e', code], { encoding: 'utf8', timeout: 30000 }).trim();
  out.push('hash: ' + hash.slice(0, 50) + '...');
} catch (e) {
  out.push('容器读 hash err: ' + String(e.message).slice(0, 150));
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const candidates = {
  明文_utopia2026: 'utopia2026',
  sha256_utopia2026: sha256('utopia2026'),
  新密码明文: undefined,
};
for (const [k, v] of Object.entries(candidates)) {
  if (!v) continue;
  const ok = await verifyPassword(v, hash);
  out.push(`${k}: ${ok ? 'MATCH' : 'no'}`);
}
writeFileSync('H:/BP2/hash-check.txt', out.join('\n'), 'utf8');
