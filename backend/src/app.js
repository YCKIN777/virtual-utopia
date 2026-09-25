import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { createSceneOrchestrator } from './agents/orchestrator.js';
import apiRouter from './routes/index.js';
import { createSceneRouter } from './routes/scene.js';
import { createModelClient } from './ai/modelClientFactory.js';
import { createBusinessToolSet } from './ai/tools/factory.js';
import { createConfiguredMemoryGateway } from './ai/memory/memoryGateway.js';
import { createSessionBoundary } from './services/sessionBoundary.js';
import { createSessionStore } from './services/sessionStore.js';
import { createStreamRouter } from './routes/stream.js';
import { createResumeRouter } from './routes/resume.js';

export const createApp = ({
  modelClient = createModelClient(),
  orchestrator,
  tools,
  memoryGateway = null,
  sessionStore = createSessionStore({
    ttlMs: env.session.ttlMs,
    maxCount: env.session.maxCount,
  }),
} = {}) => {
  const app = express();
  const sceneOrchestrator =
    orchestrator ||
    createSceneOrchestrator({
      modelClient,
      tools,
      memoryGateway,
    });
  const sessionBoundary = createSessionBoundary({
    orchestrator: sceneOrchestrator,
    sessionStore,
  });

  sessionStore.startCleanup(env.session.cleanupIntervalMs);

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: env.corsOrigin,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', apiRouter);
  app.use('/api', createSceneRouter({ orchestrator: sessionBoundary }));
  app.use('/api', createStreamRouter({ orchestrator: sceneOrchestrator }));
  app.use('/api', createResumeRouter({ orchestrator: sceneOrchestrator }));

  app.use((_request, response) => {
    response.status(404).json({
      error: 'Not Found',
    });
  });

  app.use((error, _request, response, _next) => {
    response.status(error.statusCode || 500).json({
      error: error.name || 'InternalServerError',
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : 'Request failed',
      code: error.code || undefined,
    });
  });

  return app;
};

export default createApp({
  tools: createBusinessToolSet(),
  memoryGateway: createConfiguredMemoryGateway(),
});
