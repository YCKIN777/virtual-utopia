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
import { createCaptchaRouter } from './routes/captcha.js';
import { createRegisterRouter } from './routes/register.js';
import { captchaService } from './services/captchaService.js';
import { createConversationRegistry } from './services/conversationRegistry.js';
import { createSceneAuthMiddleware } from './middleware/sceneAuth.js';

export const createApp = ({
  modelClient = createModelClient(),
  orchestrator,
  tools,
  memoryGateway = null,
  sessionStore = createSessionStore({
    ttlMs: env.session.ttlMs,
    maxCount: env.session.maxCount,
  }),
  conversationRegistry = createConversationRegistry(),
} = {}) => {
  const app = express();
  const sceneOrchestrator =
    orchestrator ||
    createSceneOrchestrator({
      modelClient,
      tools,
      memoryGateway,
      conversationRegistry,
    });
  const sessionBoundary = createSessionBoundary({
    orchestrator: sceneOrchestrator,
    sessionStore,
  });
  // P4 收尾：真实认证 —— 所有 /api/scene/route* 请求经 phase6 解析身份，
  // 注入 request.userContext（游客=null），供 orchestrator 做工具权限与记忆归属。
  const sceneAuth = createSceneAuthMiddleware({
    phase6BaseUrl: env.phase6.baseUrl,
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
  app.use('/api/scene/route', sceneAuth);
  app.use('/api', createSceneRouter({ orchestrator: sessionBoundary }));
  app.use('/api', createStreamRouter({ orchestrator: sceneOrchestrator }));
  app.use(
    '/api',
    createResumeRouter({
      orchestrator: sceneOrchestrator,
      conversationRegistry,
    }),
  );
  // 待办⑤：外层壳注册 + 验证码（公开端点；sceneAuth 对无 token 游客放行）。
  // 验证码校验通过后转发 phase5 注册，phase5 零改动。
  app.use('/api', createCaptchaRouter({ service: captchaService }));
  app.use(
    '/api',
    createRegisterRouter({
      phase5BaseUrl: env.phase5.baseUrl,
      captcha: captchaService,
    }),
  );

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
