// P5.6-1 备份脚本 v2：容器内 tar 打包 → docker cp 导出
// 用法：node backend/scripts/backup.mjs [目标目录]
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync as exec } from 'node:child_process';
import path from 'node:path';
const out = [];
const dk = 'C:/Users/Administrator/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const dest = process.argv[2] || 'H:/BP2/backup';
mkdirSync(dest, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
// 1. phase5 库
try {
  exec(dk, ['exec', 'virtual-utopia-phase5', 'sh', '-c',
    "cp /data/phase5/virtual_utopia_phase5.sqlite /tmp/p5.sqlite"], { encoding: 'utf8', timeout: 30000 });
  exec(dk, ['cp', 'virtual-utopia-phase5:/tmp/p5.sqlite', path.join(dest, 'phase5-' + stamp + '.sqlite')], { encoding: 'utf8', timeout: 60000 });
  out.push('phase5: phase5-' + stamp + '.sqlite');
} catch (e) { out.push('phase5 err: ' + String(e.message).slice(0, 120)); }
// 2. phase6 全部库（/app/backend/data）打包
try {
  exec(dk, ['exec', 'virtual-utopia-phase6', 'sh', '-c',
    "cd /app/backend/data && tar czf /tmp/p6.tgz ./*.sqlite 2>/dev/null"], { encoding: 'utf8', timeout: 30000 });
  exec(dk, ['cp', 'virtual-utopia-phase6:/tmp/p6.tgz', path.join(dest, 'phase6-' + stamp + '.tgz')], { encoding: 'utf8', timeout: 60000 });
  out.push('phase6: phase6-' + stamp + '.tgz');
} catch (e) { out.push('phase6 err: ' + String(e.message).slice(0, 120)); }
// 3. chroma 数据卷（容器内 tar /data）
try {
  exec(dk, ['exec', 'virtual-utopia-chroma', 'sh', '-c',
    "tar czf /tmp/chroma.tgz /data 2>/dev/null"], { encoding: 'utf8', timeout: 60000 });
  exec(dk, ['cp', 'virtual-utopia-chroma:/tmp/chroma.tgz', path.join(dest, 'chroma-' + stamp + '.tgz')], { encoding: 'utf8', timeout: 60000 });
  out.push('chroma: chroma-' + stamp + '.tgz');
} catch (e) { out.push('chroma err: ' + String(e.message).slice(0, 120)); }
writeFileSync(path.join(dest, 'backup-' + stamp + '.log'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
