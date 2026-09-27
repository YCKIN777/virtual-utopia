// 生成 CHROMA_AUTH_TOKEN 并写入 backend/.env + deploy/.env
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const token = randomBytes(32).toString('hex');
const apply = (p) => {
  let t = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const re = /^CHROMA_AUTH_TOKEN\s*=.*$/m;
  const line = 'CHROMA_AUTH_TOKEN=' + token;
  if (re.test(t)) t = t.replace(re, line);
  else t = t.replace(/\s*$/, '\n') + line + '\n';
  writeFileSync(p, t, 'utf8');
};
apply('H:/BP2/backend/.env');
apply('H:/BP2/deploy/.env');
writeFileSync('H:/BP2/chroma-token.txt', 'CHROMA_AUTH_TOKEN len=' + token.length, 'utf8');
