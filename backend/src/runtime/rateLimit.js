/**
 * 内存滑动窗口限流中间件（无外部依赖，独立于冻结代码，不侵入 phaseN 业务源码）。
 *
 * 用法：
 *   import { createRateLimiter, createLoginRateLimiter } from './runtime/rateLimit.js';
 *   const globalLimit = createRateLimiter({ windowMs: 60000, maxRequests: 120 });
 *   app.use(globalLimit);
 *
 *   const loginLimit = createLoginRateLimiter({ maxAttempts: 5 }); // 挂到登录路由
 *   app.post('/auth/login', loginLimit, handler);
 */

export const createRateLimiter = ({
  windowMs = 60000,
  maxRequests = 120,
  blockDurationMs = 300000,
  keyGenerator,
} = {}) => {
  const buckets = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.blockedUntil <= now && bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, windowMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return (req, res, next) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs, blockedUntil: 0 };
      buckets.set(key, bucket);
    }

    if (bucket.blockedUntil > now) {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000),
      });
      return;
    }

    if (now >= bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      bucket.blockedUntil = now + blockDurationMs;
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfterSec: Math.ceil(blockDurationMs / 1000),
      });
      return;
    }

    next();
  };
};

/**
 * 登录专用限流：按来源 IP 计数，阈值更严格，用于防暴力破解。
 * 说明：如需按账号维度锁定，可扩展 keyGenerator 组合 username。
 */
export const createLoginRateLimiter = ({
  windowMs = 60000,
  maxAttempts = 5,
  blockDurationMs = 300000,
} = {}) =>
  createRateLimiter({
    windowMs,
    maxRequests: maxAttempts,
    blockDurationMs,
    keyGenerator: (req) =>
      req.ip || (req.socket && req.socket.remoteAddress) || 'unknown',
  });
