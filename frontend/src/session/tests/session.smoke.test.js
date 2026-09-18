/**
 * 前端 H5 会话交互冒烟测试（node:test），验证三个核心场景：
 *  场景1：新建对话生成 conversation_id
 *  场景2：点击历史会话新开窗口自动带 ID
 *  场景3：刷新页面保持当前会话上下文
 *
 * 用法：node --test frontend/src/session/tests/session.smoke.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../sessionStore.js';
import { createSessionApi } from '../sessionApi.js';
import {
  parseConversationIdFromUrl,
  buildConversationUrl,
  openConversation,
  updateUrlConversationId,
} from '../sessionUtils.js';

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

const createMockFetch = (handlers) => async (url, options) => {
  const parsed = new URL(url);
  const path = parsed.pathname;
  const key = (options && options.method ? options.method : 'GET') + ' ' + path;
  const handler = handlers[key] || handlers[path];
  if (handler) return handler(parsed, options);
  return { ok: false, status: 404, json: async () => ({}) };
};

test('场景1：新建对话生成 conversation_id', async () => {
  const storage = createMemoryStorage();
  const store = createSessionStore({ storage, randomId: () => 'abc-123' });
  const userId = store.ensureUserId();
  assert.equal(userId, 'u_abc-123');

  const fetchImpl = createMockFetch({
    'POST /api/chat': async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        conversationId: 'conv_new',
        reply: 'hi',
        historyCount: 0,
      }),
    }),
  });
  const api = createSessionApi({ baseUrl: 'http://test', fetchImpl });

  // 不带 conversation_id 发送 → 后端新建会话并返回 conversation_id
  const result = await api.chat({ userId, message: '你好' });
  assert.equal(result.conversationId, 'conv_new');

  // 新增会话自动追加到列表
  store.appendConversation({ id: result.conversationId, title: '你好' });
  assert.equal(store.getConversations().length, 1);
  assert.equal(store.getConversations()[0].id, 'conv_new');
});

test('场景2：点击历史会话新开窗口自动带 ID', () => {
  let openedUrl = null;
  const windowObj = {
    open: (url) => {
      openedUrl = url;
    },
  };
  const url = openConversation({
    conversationId: 'conv_123',
    base: 'http://test/session',
    windowObj,
  });
  assert.ok(url.includes('conversation_id=conv_123'));
  assert.ok(openedUrl.includes('conversation_id=conv_123'));
});

test('场景3：刷新页面保持当前会话上下文', () => {
  const storage = createMemoryStorage();
  // 上一次会话：已保存当前会话 ID 到 localStorage
  const store = createSessionStore({ storage });
  store.setCurrentConversationId('conv_456');

  // 刷新：从 URL 解析 conversation_id + 从 localStorage 恢复
  const parsed = parseConversationIdFromUrl(
    'http://test/session?conversation_id=conv_456',
  );
  assert.equal(parsed, 'conv_456');
  const store2 = createSessionStore({ storage });
  assert.equal(store2.getCurrentConversationId(), 'conv_456');

  // pushState 更新地址栏：新会话 ID 写入 URL
  let pushedUrl = null;
  const historyObj = {
    pushState: (_state, _title, url) => {
      pushedUrl = url;
    },
  };
  const newUrl = updateUrlConversationId({
    conversationId: 'conv_789',
    base: 'http://test/session',
    historyObj,
  });
  assert.ok(newUrl.includes('conversation_id=conv_789'));
  assert.ok(pushedUrl.includes('conversation_id=conv_789'));

  // 地址栏 URL 拼接校验
  assert.equal(
    buildConversationUrl('http://test/session', 'conv_x'),
    'http://test/session?conversation_id=conv_x',
  );
});
