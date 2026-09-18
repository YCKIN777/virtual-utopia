import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpaqueToken,
  createSignedToken,
  hashToken,
  verifySignedToken,
} from '../src/security.js';

test('signed tokens verify and reject tampering', () => {
  const created = createSignedToken({
    secret: 'test-secret',
    ttlSeconds: 60,
    payload: {
      sub: 7,
      channelId: 'world-main',
      scope: 'voice',
    },
  });
  const payload = verifySignedToken({
    token: created.token,
    secret: 'test-secret',
  });

  assert.equal(payload.sub, 7);
  assert.equal(payload.channelId, 'world-main');
  assert.throws(
    () =>
      verifySignedToken({
        token: `${created.token}x`,
        secret: 'test-secret',
      }),
    {
      code: 'BP3_UNAUTHORIZED',
    },
  );
});

test('opaque tokens are hashed without retaining plaintext', () => {
  const token = createOpaqueToken(16);
  const hash = hashToken(token);

  assert.equal(typeof token, 'string');
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
});
