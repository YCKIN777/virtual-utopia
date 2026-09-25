// 临时冒烟：真实注册 201（需 phase5 已在 3300 运行）
import { createApp } from '../src/app.js';

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const username = `smoke_${Date.now().toString(36)}`;

// 1. 取验证码
let response = await fetch(`${base}/api/scene/route/captcha`);
const captcha = await response.json();
const svg = Buffer.from(
  captcha.image.slice('data:image/svg+xml;base64,'.length),
  'base64',
).toString('utf8');
const answer = [...svg.matchAll(/<text [^>]*>(\d)<\/text>/g)]
  .map((m) => m[1])
  .join('');

// 2. 正确验证码 → 真实转发 phase5 → 201 pending
response = await fetch(`${base}/api/scene/route/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username,
    password: 'secret123',
    displayName: '冒烟注册',
    captchaId: captcha.captchaId,
    captchaAnswer: answer,
  }),
});
const payload = await response.json().catch(() => null);

const ok =
  response.status === 201 &&
  payload?.status === 'pending' &&
  payload?.username === username &&
  payload?.role === 'editor';

console.log(`${ok ? 'PASS' : 'FAIL'} | real register | status=${response.status} body=${JSON.stringify(payload)}`);

server.close();
process.exit(ok ? 0 : 1);
