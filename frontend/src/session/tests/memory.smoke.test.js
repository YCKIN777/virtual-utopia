/**
 * H5 记忆管理面板 冒烟测试（node:test）：验证记忆 CRUD（列表 / 单条删除 / 一键清空）。
 * 复用 sessionStore 鉴权（userId），sessionApi 通过 mock fetch 验证端点与参数。
 *
 * 用法：node --test frontend/src/session/tests/memory.smoke.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../sessionStore.js';
import { createSessionApi } from '../sessionApi.js';

const createMemoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

test('记忆管理：加载列表 + 单条删除 + 一键清空（端点/参数校验）', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({
      method: (options && options.method) || 'GET',
      path: parsed.pathname,
      userId: parsed.searchParams.get('userId'),
    });
    const path = parsed.pathname;
    if (path === '/api/user/memory') {
      if ((options && options.method) === 'DELETE') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ userId: 'u_1', cleared: 2 }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          userId: 'u_1',
          memories: [
            { id: 'mem_1', content: '偏好宋式美学', category: 'preference' },
            { id: 'mem_2', content: '职业社区规划师', category: 'identity' },
          ],
        }),
      };
    }
    if (path === '/api/user/memory/mem_1') {
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const storage = createMemoryStorage();
  const store = createSessionStore({ storage, randomId: () => 'abc-123' });
  const userId = store.ensureUserId();
  assert.equal(userId, 'u_abc-123');

  const api = createSessionApi({ baseUrl: 'http://test', fetchImpl });

  // 1. 加载列表
  const list = await api.listMemories(userId);
  assert.equal(list.memories.length, 2);
  assert.equal(list.memories[0].id, 'mem_1');

  // 2. 单条删除
  const del = await api.deleteMemory('mem_1');
  assert.equal(del.deleted, true);

  // 3. 一键清空
  const cleared = await api.clearMemories(userId);
  assert.equal(cleared.cleared, 2);

  // 校验请求端点与参数
  assert.deepEqual(calls[0], { method: 'GET', path: '/api/user/memory', userId: 'u_abc-123' });
  assert.equal(calls[1].method, 'DELETE');
  assert.equal(calls[1].path, '/api/user/memory/mem_1');
  assert.equal(calls[2].method, 'DELETE');
  assert.equal(calls[2].path, '/api/user/memory');
  assert.equal(calls[2].userId, 'u_abc-123');
});
