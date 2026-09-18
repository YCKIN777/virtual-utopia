/**
 * 安全响应头中间件（无外部依赖，独立于冻结代码）。
 *
 * 用法：
 *   import { createSecurityHeaders } from './runtime/securityHeaders.js';
 *   app.use(createSecurityHeaders({ isProduction: true }));
 */
export const createSecurityHeaders = ({
  isProduction = false,
  csp = "default-src 'self'",
} = {}) => {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': csp,
  };

  if (isProduction) {
    headers['Strict-Transport-Security'] =
      'max-age=31536000; includeSubDomains';
  }

  return (_req, res, next) => {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    next();
  };
};
