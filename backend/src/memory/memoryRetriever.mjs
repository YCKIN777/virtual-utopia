/**
 * 长期记忆召回模块：按 importance 权重降序召回用户记忆。
 * 预留向量检索扩展接口 retrieveByVector（未来接入 embedding 后按语义相似度召回）。
 */
export const createMemoryRetriever = ({ db }) => {
  const retrieve = ({ userId, limit = 20, minImportance = 0 }) => {
    const rows = db
      .prepare(
        `SELECT id, content, category, importance, source_conversation_id, created_at, updated_at
         FROM user_memory
         WHERE user_id = ? AND importance >= ?
         ORDER BY importance DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(userId, minImportance, limit);
    return rows;
  };

  /**
   * 向量检索扩展接口（预留）：
   * 当前实现退化为 importance 召回；未来在 user_memory 表增加 embedding 列后，
   * 改为按 queryEmbedding 与记忆向量的余弦相似度排序。
   */
  const retrieveByVector = async ({
    userId,
    queryEmbedding,
    limit = 20,
    minImportance = 0,
  }) => {
    void queryEmbedding; // 预留参数
    const items = retrieve({ userId, limit, minImportance });
    return { method: 'importance-fallback', items };
  };

  return { retrieve, retrieveByVector };
};
