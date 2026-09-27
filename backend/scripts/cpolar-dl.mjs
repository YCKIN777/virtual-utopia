// 抓 cpolar 下载页，找 Windows 安装包直链
import { writeFileSync } from 'node:fs';
const out = [];
try {
  const r = await fetch('https://www.cpolar.com/download?channel=0&invite=4W3F', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  out.push('HTTP ' + r.status);
  const t = await r.text();
  const links = [...t.matchAll(/(?:href|src|data-url)="([^"]+\.(?:msi|zip|exe))[^"]*"/gi)].map((m) => m[1]);
  const uniq = [...new Set(links)];
  out.push('候选安装包链接:');
  for (const u of uniq.slice(0, 10)) out.push(u);
  // 兜底：任何含 cpolar 与 windows/amd64 的链接
  const all = [...t.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((m) => m[0]);
  const pkg = [...new Set(all.filter((u) => /\.(msi|zip)$/i.test(u) && /cpolar/i.test(u)))];
  out.push('兜底候选:');
  for (const u of pkg.slice(0, 10)) out.push(u);
} catch (e) {
  out.push('ERR: ' + e.message);
}
writeFileSync('H:/BP2/cpolar-dl.txt', out.join('\n'), 'utf8');
