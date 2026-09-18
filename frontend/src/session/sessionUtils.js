/**
 * H5 会话 URL 工具：解析 conversation_id、拼接会话参数、新开标签页、pushState 更新地址栏。
 * 所有函数纯函数化，window/history 可注入，便于测试。
 */
export const parseConversationIdFromUrl = (url) => {
  try {
    const u = new URL(url);
    return u.searchParams.get('conversation_id') || null;
  } catch {
    return null;
  }
};

export const buildConversationUrl = (base, conversationId) => {
  const u = new URL(base);
  u.searchParams.set('conversation_id', conversationId);
  return u.toString();
};

export const openConversation = ({
  conversationId,
  base,
  windowObj = globalThis.window,
} = {}) => {
  const url = buildConversationUrl(base, conversationId);
  if (windowObj && typeof windowObj.open === 'function') {
    windowObj.open(url, '_blank');
  }
  return url;
};

export const updateUrlConversationId = ({
  conversationId,
  base,
  historyObj = globalThis.history,
} = {}) => {
  if (!historyObj || typeof historyObj.pushState !== 'function') return null;
  const url = buildConversationUrl(base, conversationId);
  historyObj.pushState({ conversationId }, '', url);
  return url;
};
