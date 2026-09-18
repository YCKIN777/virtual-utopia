export class RagIntegrationError extends Error {
  constructor(message, options = {}) {
    super(message, {
      cause: options.cause,
    });
    this.name = 'RagIntegrationError';
    this.code = options.code || 'RAG_INTEGRATION_ERROR';
  }
}

export const createRagClient = ({
  baseUrl,
  collectionName,
  similarityThreshold,
  topK,
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
}) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return Object.freeze({
    async retrieve(query) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
      let response;

      try {
        response = await fetchImpl(`${normalizedBaseUrl}/api/rag/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            collectionName,
            topK,
          }),
          signal: abortController.signal,
        });
      } catch (error) {
        throw new RagIntegrationError('RAG query request failed', {
          code: 'RAG_QUERY_REQUEST_FAILED',
          cause: error,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();

        throw new RagIntegrationError(
          `RAG query failed with status ${response.status}: ${errorBody}`,
          {
            code: 'RAG_QUERY_API_ERROR',
          },
        );
      }

      let payload;

      try {
        payload = await response.json();
      } catch (error) {
        throw new RagIntegrationError('RAG query returned invalid JSON', {
          code: 'RAG_QUERY_INVALID_RESPONSE',
          cause: error,
        });
      }

      if (!Array.isArray(payload.matches)) {
        throw new RagIntegrationError(
          'RAG query response does not contain matches',
          {
            code: 'RAG_QUERY_INVALID_RESPONSE',
          },
        );
      }

      return payload.matches.filter(
        (match) =>
          typeof match.chunk === 'string' &&
          match.chunk.trim() !== '' &&
          Number.isFinite(match.similarity) &&
          match.similarity >= similarityThreshold,
      );
    },
  });
};
