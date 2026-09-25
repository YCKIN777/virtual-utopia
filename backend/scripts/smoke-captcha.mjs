// 临时冒烟：captcha 端点 + register 校验路径（真实 HTTP）
import { createApp } from '../src/app.js';

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const results = [];

// 1. 验证码端点（公开）
let response = await fetch(`${base}/api/scene/route/captcha`);
let payload = await response.json();
results.push([
  'captcha GET',
  response.status === 200 && payload.captchaId && payload.image?.startsWith('data:image/svg+xml'),
  `status=${response.status} id=${Boolean(payload.captchaId)} image=${payload.image?.slice(0, 30)}`,
]);

// 2. 注册：缺验证码 → 403 CAPTCHA_INVALID
response = await fetch(`${base}/api/scene/route/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'smoketest01',
    password: 'secret123',
    displayName: '冒烟测试',
  }),
});
payload = await response.json().catch(() => null);
results.push([
  'register no-captcha',
  response.status === 403 && payload?.code === 'CAPTCHA_INVALID',
  `status=${response.status} code=${payload?.code}`,
]);

// 3. 注册：入参非法 → 400 VALIDATION_ERROR
response = await fetch(`${base}/api/scene/route/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'ab',
    password: '1',
    displayName: 'x',
    captchaId: 'fake',
    captchaAnswer: '1234',
  }),
});
payload = await response.json().catch(() => null);
results.push([
  'register bad-input',
  response.status === 400 && payload?.code === 'VALIDATION_ERROR',
  `status=${response.status} code=${payload?.code}`,
]);

// 4. 注册：验证码正确但 phase5 未起 → 503 REGISTER_SERVICE_UNAVAILABLE
response = await fetch(`${base}/api/scene/route/captcha`);
console.log('step4 captcha status:', response.status);
const captcha2 = await response.json();
const svg = Buffer.from(
  captcha2.image.slice('data:image/svg+xml;base64,'.length),
  'base64',
).toString('utf8');
const answer = [...svg.matchAll(/<text [^>]*>(\d)<\/text>/g)]
  .map((m) => m[1])
  .join('');
response = await fetch(`${base}/api/scene/route/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'smoketest02',
    password: 'secret123',
    displayName: '冒烟二号',
    captchaId: captcha2.captchaId,
    captchaAnswer: answer,
  }),
});
payload = await response.json().catch(() => null);
results.push([
  'register valid-captcha (phase5 down)',
  response.status === 503 && payload?.code === 'REGISTER_SERVICE_UNAVAILABLE',
  `status=${response.status} code=${payload?.code}`,
]);

for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
}

server.close();
