import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ragConfig } from './config.js';
import { ingestDocuments } from './ingestService.js';
import { retrieveKnowledge } from './retrievalService.js';
import { validateIngestRequest, validateQueryRequest } from './validation.js';
import { checkVectorStore } from './vectorStore.js';

const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

export const createRagApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/health',
    asyncHandler(async (_request, response) => {
      const vectorStore = await checkVectorStore();

      response.json({
        service: 'virtual-utopia-rag',
        ...vectorStore,
      });
    }),
  );

  app.post(
    '/api/rag/ingest',
    asyncHandler(async (request, response) => {
      const result = await ingestDocuments(validateIngestRequest(request.body));

      response.json(result);
    }),
  );

  app.post(
    '/api/rag/query',
    asyncHandler(async (request, response) => {
      const result = await retrieveKnowledge(
        validateQueryRequest(request.body),
      );

      response.json(result);
    }),
  );

  app.use((_request, response) => {
    response.status(404).json({
      error: 'NotFound',
      code: 'RAG_NOT_FOUND',
      message: 'route not found',
    });
  });

  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({
      error: error.name || 'RagError',
      code: error.code || 'RAG_ERROR',
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : 'RAG request failed',
    });
  });

  return app;
};

export const startRagServer = async ({ port = ragConfig.port } = {}) => {
  const app = createRagApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, 'localhost');

    server.once('listening', () => {
      resolve(server);
    });
    server.once('error', reject);
  });
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startRagServer()
    .then(() => {
      console.log(
        `RAG service listening on http://localhost:${ragConfig.port}`,
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
