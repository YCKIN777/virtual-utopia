/**
 * 记忆服务入口：组装依赖 → 挂载 guard 防护组装器 → 监听端口 → 优雅关闭。
 * 保持原有安全中间件链路不变（复用 createGuardedApp）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openMemoryDatabase } from './database.mjs';
import { createLlmClient } from './llmClient.mjs';
import { createMemoryOrchestrator } from './memoryOrchestrator.mjs';
import { createMemoryApp } from './httpServer.mjs';
import { createGuardedApp } from '../runtime/guard.js';

// 3D 虚拟乌托邦前端静态资源目录（默认指向已打包的 virtual-utopia dist）
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticDir = () =>
  process.env.MEMORY_STATIC_DIR ||
  path.resolve(
    moduleDir,
    '..',
    '..',
    '..',
    'frontend',
    'src',
    'virtual-utopia',
    'dist',
  );

// 开发环境 CORS 中间件：允许跨域访问 /api 接口
const createCorsMiddleware = ({ origin } = {}) => {
  const allowOrigin = origin || process.env.CORS_ORIGIN || '*';
  return (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Request-Id',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
};

export const startMemoryServer = async ({
  databasePath,
  port = Number(process.env.MEMORY_PORT) || 3600,
  llmClient: providedLlmClient,
  staticDir,
  corsOrigin,
} = {}) => {
  const db = openMemoryDatabase({ databasePath });
  const llmClient = providedLlmClient || createLlmClient();
  const orchestrator = createMemoryOrchestrator({ db, llmClient });
  const frozenApp = createMemoryApp({ orchestrator });

  // 受防护的 /api 记忆接口（保留原有安全中间件链路）
  const { app: guardedApp } = createGuardedApp({
    service: 'virtual-utopia-memory',
    app: frozenApp,
    options: {
      isProduction: process.env.NODE_ENV === 'production',
      rateLimit: {
        maxRequests: Number(process.env.GUARD_RATE_MAX) || 300,
      },
    },
  });

  // 顶层应用：CORS → 3D 场景静态托管 → 受防护 /api
  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware({ origin: corsOrigin }));
  app.use(express.static(staticDir || defaultStaticDir()));
  app.use(guardedApp);

  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(port, 'localhost');
    listeningServer.once('listening', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });

  const close = async () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        try {
          db.close();
        } catch {
          // ignore
        }
        if (error) reject(error);
        else resolve();
      });
    });

  return { app, server, db, orchestrator, close };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  let handle = null;
  let closing = false;

  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ event: 'shutdown', signal }));
    const close =
      handle && typeof handle.close === 'function'
        ? handle.close()
        : Promise.resolve();
    close.then(() => process.exit(0)).catch(() => process.exit(1));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error(
      JSON.stringify({ event: 'uncaughtException', message: error && error.message }),
    );
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({ event: 'unhandledRejection', reason: String(reason) }),
    );
    process.exit(1);
  });

  startMemoryServer()
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-memory',
          port: result.server.address().port,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
