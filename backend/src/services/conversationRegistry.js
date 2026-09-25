// backend/src/services/conversationRegistry.js
// 待办⑥：conversationId → owner 归属注册表（HITL resume 归属校验）。
// 内存 Map：注册会话发起人（userContext.userId），供 resume 校验「请求者是否为该会话 owner」。
// 与 sessionStore 同为内存态（重启即失）；上限清理防无限增长。
export const createConversationRegistry = ({
  maxEntries = 2000,
  now = Date.now,
} = {}) => {
  const store = new Map();

  const ensureCapacity = () => {
    if (store.size < maxEntries) return;

    // 简单 FIFO 清理：删除最早的若干条（保留最新的一半）
    const entries = [...store.entries()];
    const removeCount = Math.ceil(maxEntries / 2);

    for (const [conversationId] of entries.slice(0, removeCount)) {
      store.delete(conversationId);
    }
  };

  return {
    // 注册/更新 owner：同一 conversationId 首次记录发起人；后续同人刷新不覆盖，异人更新（最后写入者视为 owner）。
    register(conversationId, userContext) {
      if (!conversationId || !userContext?.userId) return;

      ensureCapacity();

      const previous = store.get(conversationId);

      store.set(conversationId, {
        userId: userContext.userId,
        role: userContext.role ?? null,
        username: userContext.username ?? '',
        createdAt: previous?.createdAt ?? now(),
        updatedAt: now(),
      });
    },

    // 查询 owner 归属（不存在返回 null）
    getOwner(conversationId) {
      return store.get(conversationId) ?? null;
    },

    // 校验：请求者是否该会话 owner（admin 在路由层单独放行）
    isOwner(conversationId, userId) {
      if (!conversationId || !userId) return false;

      const owner = store.get(conversationId);

      return owner?.userId === userId;
    },

    get size() {
      return store.size;
    },
  };
};

export const conversationRegistry = createConversationRegistry();
