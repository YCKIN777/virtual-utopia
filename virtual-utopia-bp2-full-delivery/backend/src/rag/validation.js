import { ragConfig } from './config.js';
import { RagValidationError } from './errors.js';

const readChunkSettings = ({
  chunkSize = ragConfig.chunkSize,
  chunkOverlap = ragConfig.chunkOverlap,
}) => {
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 100 ||
    chunkSize > 4000 ||
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  ) {
    throw new RagValidationError(
      'chunkSize must be between 100 and 4000 and chunkOverlap must be smaller than chunkSize',
    );
  }

  return {
    chunkSize,
    chunkOverlap,
  };
};

const readCollectionName = (collectionName) => {
  if (
    collectionName === undefined ||
    collectionName === null ||
    collectionName === ''
  ) {
    return ragConfig.collectionName;
  }

  if (typeof collectionName !== 'string') {
    throw new RagValidationError('collectionName must be a string');
  }

  return collectionName.trim();
};

export const validateIngestRequest = (body = {}) => {
  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    throw new RagValidationError('paths must be a non-empty array');
  }

  if (body.reset !== undefined && typeof body.reset !== 'boolean') {
    throw new RagValidationError('reset must be a boolean');
  }

  return {
    paths: body.paths,
    collectionName: readCollectionName(body.collectionName),
    ...readChunkSettings(body),
    reset: body.reset === true,
  };
};

export const validateQueryRequest = (body = {}) => {
  if (typeof body.query !== 'string' || body.query.trim() === '') {
    throw new RagValidationError('query must be a non-empty string');
  }

  const topK = body.topK ?? 5;

  if (!Number.isInteger(topK) || topK <= 0 || topK > 20) {
    throw new RagValidationError('topK must be an integer between 1 and 20');
  }

  return {
    query: body.query.trim(),
    collectionName: readCollectionName(body.collectionName),
    topK,
  };
};
