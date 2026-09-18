/**
 * 受防护应用组装器：把独立中间件（请求日志 / 安全头 / 全局限流）以非侵入方式
 * 包裹到已有 Express 应用之上，不修改冻结的 phaseN 业务源码。
 *
 * 用法：
 *   import { createPhase5App } from '../phase5/httpServer.js';
 *   import { createGuardedApp } from './runtime/guard.js';
 *   const frozen = createPhase5App({ repositories, config, database });
 *   const { app } = createGuardedApp({ service: 'phase5', app: frozen });
 *   app.listen(3300);
 */
import express from 'express';
import { createLogger } from './logger.js';
import { createRequestLogger } from './requestLogger.js';
import { createSecurityHeaders } from './securityHeaders.js';
import { createRateLimiter } from './rateLimit.js';

export const createGuardedApp = ({
  service = 'virtual-utopia',
  app,
  options = {},
} = {}) => {
  const logger = options.logger || createLogger({ service });
  const guarded = express();

  guarded.disable('x-powered-by');
  guarded.use(createRequestLogger({ logger }));
  guarded.use(
    createSecurityHeaders({
      isProduction: Boolean(options.isProduction),
      csp: options.csp,
    }),
  );

  if (options.rateLimit !== false) {
    guarded.use(createRateLimiter(options.rateLimit));
  }

  guarded.use(app);

  return { app: guarded, logger };
};
