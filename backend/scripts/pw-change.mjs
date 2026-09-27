// 直接更新库内 admin password_hash（先备份）
import { writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hashPassword } from '../src/phase5/security.js';
const out = [];
const dk = 'C:/Users/Administrator/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const newPw = readFileSync('H:/BP2/admin-new-password.txt', 'utf8').trim();
const sha256 = (s) => import('node:crypto').then((m) => m.createHash('sha256').update(s, 'utf8').digest('hex'));
const newHash = await hashPassword(await sha256(newPw));
out.push('新 hash 前缀: ' + newHash.slice(0, 30));
// 备份
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = '/data/phase5/backup-' + ts + '.sqlite';
try {
  execFileSync(dk, ['exec', 'virtual-utopia-phase5', 'node', '-e',
    "const fs=require('fs');fs.copyFileSync('/data/phase5/virtual_utopia_phase5.sqlite','" + bak + "');console.log('backup ok')"],
    { encoding: 'utf8', timeout: 30000 });
  out.push('备份: ' + bak);
} catch (e) {
  out.push('备份 err: ' + String(e.message).slice(0, 150));
}
// UPDATE（hash 经 process.env 传入避免引号问题）
try {
  execFileSync(dk, ['exec', '-e', 'NEW_HASH=' + newHash, 'virtual-utopia-phase5', 'node', '-e',
    "const Database=require('better-sqlite3');const db=new Database('/data/phase5/virtual_utopia_phase5.sqlite');const r=db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(process.env.NEW_HASH);console.log('updated changes='+r.changes)"],
    { encoding: 'utf8', timeout: 30000 });
  out.push('UPDATE 完成');
} catch (e) {
  out.push('UPDATE err: ' + String(e.message).slice(0, 200));
  if (e.stdout) out.push('stdout: ' + e.stdout.slice(0, 300));
  if (e.stderr) out.push('stderr: ' + e.stderr.slice(0, 300));
}
// 验证：sha256(newPw) 登录
try {
  const login = await fetch('http://localhost:3300/api/phase5/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: await sha256(newPw) }),
    signal: AbortSignal.timeout(10000),
  });
  out.push('新密码登录（sha256 口径）: HTTP ' + login.status);
} catch (e) {
  out.push('验证登录 err: ' + String(e.message).slice(0, 120));
}
writeFileSync('H:/BP2/pw-change.txt', out.join('\n'), 'utf8');
