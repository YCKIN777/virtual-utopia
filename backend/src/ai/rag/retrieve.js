// backend/src/ai/rag/retrieve.js
// P2: 检索封装 —— 校验规则与旧版一致，向量检索走 Chroma 官方集成。
import { ragConfig } from '../../rag/config.js';
import { RagValidationError } from '../../rag/errors.js';
import { queryChunks } from './vectorStore.js';

export const retrieveKnowledge = async ({
  query,
  collectionName = ragConfig.collectionName,
  topK = 5,
} = {}) => {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new RagValidationError('query must be a non-empty string');
  }

  if (!Number.isInteger(topK) || topK <= 0 || topK > 20) {
    throw new RagValidationError('topK must be an integer between 1 and 20');
  }

  const matches = await queryChunks({
    collectionName,
    query: query.trim(),
    topK,
  });

  return {
    query: query.trim(),
    collectionName,
    matches,
  };
};
