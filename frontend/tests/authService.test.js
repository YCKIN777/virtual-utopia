import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthServiceError,
  SCENE_AUTH_TOKEN_KEY,
  createAuthService,
  sha256Hex,
} from '../src/services/authService.js';

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// localStorage 兼容的内存实现（getItem/setItem/removeItem）。
const createMemoryStorage = () => {
  const map = new Map();

  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _has: (key) => map.has(key),
    _get: (key) => map.get(key),
  };
};

test('sha256Hex 输出正确（与 RFC 测试向量一致）', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    await sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('login 走 phase6 端点，密码前端 sha256，token 写入 storage', async () => {
  const requests = [];
  const storage = createMemoryStorage();
  const service = createAuthService({
    baseUrl: 'http://localhost:3400',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(200, {
        token: 'token-kin',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 40, username: 'KIN', role: 'admin', displayName: 'KIN' },
      });
    },
    storage,
  });

  const payload = await service.login({ username: 'KIN', password: 'pw' });

  assert.equal(payload.token, 'token-kin');
  assert.equal(payload.user.role, 'admin');
  assert.equal(requests[0].url, 'http://localhost:3400/api/phase6/auth/login');
  assert.equal(requests[0].options.method, 'POST');
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.username, 'KIN');
  assert.equal(body.password, await sha256Hex('pw'));
  assert.equal(storage._get(SCENE_AUTH_TOKEN_KEY), 'token-kin');
});

test('me 携带 Bearer token', async () => {
  const requests = [];
  const service = createAuthService({
    baseUrl: 'http://localhost:3400',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(200, { id: 40, username: 'KIN', role: 'admin' });
    },
    storage: createMemoryStorage(),
  });

  const user = await service.me('token-kin');

  assert.equal(requests[0].url, 'http://localhost:3400/api/phase6/auth/me');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token-kin');
  assert.equal(user.role, 'admin');
});

test('logout 后清除 storage token', async () => {
  const storage = createMemoryStorage();
  storage.setItem(SCENE_AUTH_TOKEN_KEY, 'token-kin');
  const service = createAuthService({
    baseUrl: 'http://localhost:3400',
    fetchImpl: async () => jsonResponse(200, { ok: true }),
    storage,
  });

  await service.logout('token-kin');

  assert.equal(storage._has(SCENE_AUTH_TOKEN_KEY), false);
});

test('认证服务网络不可达 → AuthServiceError(AUTH_SERVICE_UNAVAILABLE)', async () => {
  const service = createAuthService({
    baseUrl: 'http://localhost:3400',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
    storage: createMemoryStorage(),
  });

  await assert.rejects(service.me('token'), (error) => {
    assert.ok(error instanceof AuthServiceError);
    assert.equal(error.code, 'AUTH_SERVICE_UNAVAILABLE');

    return true;
  });
});

test('登录失败（401）→ AuthServiceError 携带状态与后端错误码', async () => {
  const service = createAuthService({
    baseUrl: 'http://localhost:3400',
    fetchImpl: async () =>
      jsonResponse(401, { error: 'UNAUTHORIZED', message: '账号或密码错误' }),
    storage: createMemoryStorage(),
  });

  await assert.rejects(service.login({ username: 'x', password: 'y' }), (error) => {
    assert.ok(error instanceof AuthServiceError);
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(error.status, 401);
    assert.equal(error.message, '账号或密码错误');

    return true;
  });
});
