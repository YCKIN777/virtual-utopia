import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { createModuleBApp } from './app.js';
import { createChannelAccessService } from './channelAccessService.js';
import { createChatService } from './chatService.js';
import { readModuleBConfig } from './config.js';
import { openModuleBDatabase } from './database.js';
import { attachModuleBRealtimeServer } from './realtimeServer.js';
import { createModuleBRepositories } from './repositories.js';
import { createSensitiveFilter } from './sensitiveFilter.js';
import { createTicketContextStore } from './ticketContextStore.js';

export const startModuleBServer = async ({
  config = readModuleBConfig(),
  authAdapter,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  const database = await openModuleBDatabase({
    databasePath: config.databasePath,
  });
  const repositories = createModuleBRepositories(database);
  const sensitiveFilter = createSensitiveFilter();
  const channelAccess = createChannelAccessService({
    moduleABaseUrl: config.moduleABaseUrl,
    fetchImpl,
    timeoutMs: config.requestTimeoutMs,
  });
  const realtimeHub = createRealtimeHub();
  const ticketContextStore = createTicketContextStore({
    ttlSeconds: config.ticketTtlSeconds,
  });
  const chatService = createChatService({
    repositories,
    channelAccess,
    sensitiveFilter,
    realtimeHub,
  });
  const server = http.createServer();
  const realtime = attachModuleBRealtimeServer({
    server,
    config,
    hub: realtimeHub,
    chatService,
    ticketContextStore,
  });
  const app = createModuleBApp({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        fetchImpl,
      }),
    repositories,
    chatService,
    realtimeHub,
    ticketService: realtime.ticketService,
    ticketContextStore,
  });

  server.on('request', app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    ticketContextStore.clear();
    await realtime.close();

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    database.close();
  };

  return {
    chatService,
    close,
    config,
    repositories,
    server,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readModuleBConfig();
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
      JSON.stringify({
        event: 'uncaughtException',
        message: error && error.message,
      }),
    );
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({ event: 'unhandledRejection', reason: String(reason) }),
    );
    process.exit(1);
  });

  startModuleBServer({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-module-b',
          host: config.host,
          port: result.server.address().port,
          websocket: '/ws/bp4/realtime',
          moduleABaseUrl: config.moduleABaseUrl,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
