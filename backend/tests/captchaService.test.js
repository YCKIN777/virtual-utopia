// backend/tests/captchaService.test.js
// 待办⑤：验证码服务单测 —— 生成/校验/一次性/过期/上限清理。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCaptchaService } from '../src/services/captchaService.js';

// 测试辅助：从 SVG data URL 提取 4 位数字答案（与 verify 端到端同路径）。
const extractAnswer = (dataUrl) => {
  const svg = Buffer.from(
    dataUrl.slice('data:image/svg+xml;base64,'.length),
    'base64',
  ).toString('utf8');
  const texts = [...svg.matchAll(/<text [^>]*>(\d)<\/text>/g)].map(
    (match) => match[1],
  );

  return texts.join('');
};

test('create：返回 captchaId 与 SVG 图片 data URL（4 位数字）', () => {
  const service = createCaptchaService();
  const { captchaId, image } = service.create();

  assert.ok(captchaId);
  assert.match(image, /^data:image\/svg\+xml;base64,/);
  assert.equal(extractAnswer(image).length, 4);
});

test('verify：正确答案通过，错误答案拒绝', () => {
  const service = createCaptchaService();
  const { captchaId, image } = service.create();

  assert.equal(service.verify(captchaId, extractAnswer(image)), true);
  assert.equal(service.verify(captchaId, '0000'), false);
});

test('verify：一次性 —— 校验成功后条目被消费', () => {
  const service = createCaptchaService();
  const { captchaId, image } = service.create();
  const answer = extractAnswer(image);

  assert.equal(service.verify(captchaId, answer), true);
  assert.equal(service.verify(captchaId, answer), false);
});

test('verify：过期条目拒绝并清理', () => {
  let now = 1_000;
  const service = createCaptchaService({
    ttlMs: 5_000,
    now: () => now,
  });
  const { captchaId, image } = service.create();
  const answer = extractAnswer(image);

  now = 6_001; // 已过期
  assert.equal(service.verify(captchaId, answer), false);

  now = 1_000;
  const { captchaId: freshId, image: freshImage } = service.create();
  const before = service.size(); // 此时含 freshId
  now = 6_001; // freshId 也过期
  service.verify(freshId, extractAnswer(freshImage));
  assert.ok(service.size() < before); // 过期条目被清理
});

test('上限清理：超过 maxEntries 时清除过期项', () => {
  let now = 1_000;
  const service = createCaptchaService({
    ttlMs: 5_000,
    maxEntries: 2,
    now: () => now,
  });

  service.create(); // t=1000 过期
  now = 6_001;
  service.create(); // 触发 sweep：清掉过期
  service.create();

  assert.ok(service.size() <= 2);
});

test('verify：缺失参数直接拒绝（防 null/undefined 攻击）', () => {
  const service = createCaptchaService();

  assert.equal(service.verify(null, '1234'), false);
  assert.equal(service.verify('some-id', ''), false);
  assert.equal(service.verify('some-id', null), false);
});
