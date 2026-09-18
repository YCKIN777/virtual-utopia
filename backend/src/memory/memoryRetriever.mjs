/**
 * 长期记忆召回模块：
 *   - 权重模式（weight）：按 importance 降序（旧行为，兼容）。
 *   - 向量模式（vector，默认）：用户提问时生成 query embedding，与记忆向量做余弦相似度召回，
 *     相似度优先，importance 作二次排序。
 *   - 兼容旧记忆：无 embedding 的记忆 similarity 计为 0（退化为 importance 排序），不崩溃。
 *
 * 扩展点：将本地确定性 embedding 替换为真实模型时，仅需把 retrieveByVector 改为 async 调用远程 API。
 */
import { createEmbeddingGenerator } from './embedding.mjs';

const byUpdatedDesc = (a, b) =>
  String(b.updated_at).localeCompare(String(a.updated_at));

export const createMemoryRetriever = ({
  db,
  embeddingGenerator,
  mode,
} = {}) => {
  const emb = embeddingGenerator || createEmbeddingGenerator();
  const retrievalMode = mode || process.env.MEMORY_RETRIEVAL_MODE || 'vector';

  const parseEmbedding = (value) => {
    if (!value) return null;
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  };

  const loadMemories = ({ userId, minImportance = 0 }) =>
    db
      .prepare(
        `SELECT id, content, category, importance, embedding, source_conversation_id, created_at, updated_at
         FROM user_memory
         WHERE user_id = ? AND importance >= ?`,
      )
      .all(userId, minImportance);

  const retrieveByWeight = ({ userId, limit = 20, minImportance = 0 }) => {
    const rows = loadMemories({ userId, minImportance });
    return rows
      .sort((a, b) => b.importance - a.importance || byUpdatedDesc(a, b))
      .slice(0, limit);
  };

  const retrieveByVector = ({ userId, query, limit = 20, minImportance = 0 }) => {
    const queryVec = emb.generate(query);
    const rows = loadMemories({ userId, minImportance });
    const scored = rows.map((row) => {
      const vec = parseEmbedding(row.embedding);
      const similarity = vec ? emb.cosine(queryVec, vec) : 0;
      return { ...row, similarity };
    });
    return scored
      .sort(
        (a, b) =>
          b.similarity - a.similarity ||
          b.importance - a.importance ||
          byUpdatedDesc(a, b),
      )
      .slice(0, limit);
  };

  const retrieve = ({ userId, query, limit = 20, minImportance = 0 }) => {
    if (retrievalMode === 'vector' && query) {
      return retrieveByVector({ userId, query, limit, minImportance });
    }
    return retrieveByWeight({ userId, limit, minImportance });
  };

  return {
    retrieve,
    retrieveByVector,
    retrieveByWeight,
    mode: retrievalMode,
  };
};
