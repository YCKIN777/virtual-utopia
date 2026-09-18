import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { createSceneOrchestrator } from './agents/orchestrator.js';
import apiRouter from './routes/index.js';
import { createSceneRouter } from './routes/scene.js';
import { createDeepSeekClient } from './services/deepSeekClient.js';
import { createSessionBoundary } from './services/sessionBoundary.js';
import { createSessionStore } from './services/sessionStore.js';

export const createApp = ({
  modelClient = createDeepSeekClient(),
  orchestrator,
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

export default createApp();
