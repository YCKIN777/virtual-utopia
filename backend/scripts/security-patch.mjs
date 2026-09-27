// P5.6-1 生产安全加固：生成强随机密钥并写入 .env / deploy/.env
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const gen = (bytes) => randomBytes(bytes).toString('hex');
const newSecret = gen(32);
const newServiceToken = gen(32);
// admin 新密码：16 位可读混合（大写+小写+数字+符号）
const adminPw = 'Utopia@' + randomBytes(6).toString('hex') + 'Kx';

const backendEnv = 'H:/BP2/backend/.env';
let t = existsSync(backendEnv) ? readFileSync(backendEnv, 'utf8') : '';
const setLine = (text, key, value) => {
  const re = new RegExp('^' + key + '\\s*=.*$', 'm');
  const line = key + '=' + value;
  return re.test(text) ? text.replace(re, line) : text.replace(/\s*$/, '\n') + line + '\n';
};
t = setLine(t, 'PHASE5_AUTH_SECRET', newSecret);
t = setLine(t, 'PHASE5_SERVICE_TOKEN', newServiceToken);
writeFileSync(backendEnv, t, 'utf8');

// deploy/.env：compose 的 ${VAR:-default} 插值来源
const deployEnv = 'H:/BP2/deploy/.env';
let d = existsSync(deployEnv) ? readFileSync(deployEnv, 'utf8') : '';
d = setLine(d, 'PHASE5_AUTH_SECRET', newSecret);
d = setLine(d, 'PHASE5_SERVICE_TOKEN', newServiceToken);
writeFileSync(deployEnv, d, 'utf8');

const out = [
  'PHASE5_AUTH_SECRET 已写入（' + newSecret.length + ' hex）',
  'PHASE5_SERVICE_TOKEN 已写入（' + newServiceToken.length + ' hex）',
  'ADMIN 新密码: ' + adminPw,
];
writeFileSync('H:/BP2/security-patch.txt', out.join('\n'), 'utf8');
// 新密码单独文件（给用户）
writeFileSync('H:/BP2/admin-new-password.txt', adminPw, 'utf8');
