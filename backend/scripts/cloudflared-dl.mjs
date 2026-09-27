// 下载 cloudflared（官方 + 镜像双通道）
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const out = [];
const dest = 'H:/BP2/cloudflared/cloudflared.exe';
const urls = [
  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
  'https://mirror.ghproxy.com/https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
];
const cmd = 'curl.exe';
for (const url of urls) {
  try {
    execFileSync(cmd, ['-L', '-o', dest, '--connect-timeout', '15', '--max-time', '180', url], { encoding: 'utf8', timeout: 190000 });
    out.push('下载成功: ' + url);
    break;
  } catch (e) {
    out.push('失败: ' + url + ' | ' + String(e.message).slice(0, 120));
  }
}
try {
  const v = execFileSync(dest, ['--version'], { encoding: 'utf8', timeout: 15000 });
  out.push('版本: ' + v.trim().slice(0, 100));
} catch (e) {
  out.push('版本验证 err: ' + String(e.message).slice(0, 150));
}
writeFileSync('H:/BP2/cloudflared-dl.txt', out.join('\n'), 'utf8');
