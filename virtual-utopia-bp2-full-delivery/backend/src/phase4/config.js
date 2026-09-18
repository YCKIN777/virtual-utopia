const toBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
};

const toInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }

  return parsed;
};

const toRatio = (value, fallback) => {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
};

export const readPhase4Config = (environment = process.env) => ({
  enabled: toBoolean(environment.ENABLE_RAG_ENHANCE, false),
  ragBaseUrl: environment.RAG_BASE_URL || 'http://localhost:3100',
  collectionName: environment.RAG_COLLECTION || 'virtual_utopia_rag',
  similarityThreshold: toRatio(environment.RAG_SIMILARITY_THRESHOLD, 0.2),
  topK: toInteger(environment.RAG_TOP_K, 5, 1, 20),
  port: toInteger(environment.PHASE4_PORT, 3000, 1, 65535),
});
