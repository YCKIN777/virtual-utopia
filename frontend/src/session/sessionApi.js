/**
 * H5 会话 API 客户端（对接后端 memory 服务，默认 http://localhost:3600）。
 * fetchImpl 可注入，便于测试。
 */
const DEFAULT_BASE_URL = 'http://localhost:3600';

export const createSessionApi = ({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) => {
  const request = async (path, options) => {
    const res = await fetchImpl(baseUrl.replace(/\/+$/, '') + path, options);
    if (!res.ok) {
      throw new Error('session api ' + res.status);
    }
    return res.json();
  };

  return {
    chat: ({ userId, conversationId, message }) =>
      request('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, conversationId, message }),
      }),
    listConversations: (userId) =>
      request('/api/conversation/list?userId=' + encodeURIComponent(userId)),
    getConversation: (id) =>
      request('/api/conversation/' + encodeURIComponent(id)),
    createConversation: ({ userId, sceneId, title }) =>
      request('/api/conversation/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, sceneId, title }),
      }),
  };
};
