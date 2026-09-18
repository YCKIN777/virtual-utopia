import { ragConfig } from './config.js';
import { RagValidationError } from './errors.js';
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
