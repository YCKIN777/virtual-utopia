/**
 * 请求日志中间件：注入 requestId + 访问耗时日志（无外部依赖，独立于冻结代码）。
 */
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger.js';

export const createRequestLogger = ({ logger } = {}) => {
  const log = logger || createLogger();

  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req.id);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      log.info('request', {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms: Math.round(ms),
      });
    });

    next();
  };
};
