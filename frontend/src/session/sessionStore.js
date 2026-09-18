/**
 * H5 会话本地存储：userId、会话列表、当前会话 ID（localStorage 持久化）。
 * storage / randomId 可注入，便于测试。
 */
const KEYS = {
  userId: 'vu_user_id',
  conversations: 'vu_conversations',
  currentConversationId: 'vu_current_conversation_id',
};

export const createSessionStore = ({
  storage = globalThis.localStorage,
  randomId = () => globalThis.crypto.randomUUID(),
} = {}) => {
  const safeGet = (key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeSet = (key, value) => {
    try {
      storage.setItem(key, String(value));
    } catch {
      // ignore
    }
  };
  const safeRemove = (key) => {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  };

  const getUserId = () => safeGet(KEYS.userId);
  const setUserId = (id) => safeSet(KEYS.userId, id);

  const ensureUserId = () => {
    let id = getUserId();
    if (!id) {
      id = 'u_' + randomId();
      setUserId(id);
    }
    return id;
  };

  const getConversations = () => {
    try {
      return JSON.parse(safeGet(KEYS.conversations) || '[]');
    } catch {
      return [];
    }
  };
  const setConversations = (list) =>
    safeSet(KEYS.conversations, JSON.stringify(list || []));
  const appendConversation = (conv) => {
    const list = getConversations();
    if (!list.some((c) => c.id === conv.id)) {
      list.unshift(conv);
      setConversations(list);
    }
  };

  const getCurrentConversationId = () => safeGet(KEYS.currentConversationId);
  const setCurrentConversationId = (id) => {
    if (id) safeSet(KEYS.currentConversationId, id);
    else safeRemove(KEYS.currentConversationId);
  };

  return {
    KEYS,
    getUserId,
    setUserId,
    ensureUserId,
    getConversations,
    setConversations,
    appendConversation,
    getCurrentConversationId,
    setCurrentConversationId,
  };
};
