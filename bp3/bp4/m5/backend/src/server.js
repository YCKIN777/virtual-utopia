import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createM5App } from './app.js';
import { readM5Config } from './config.js';
import { openM5Database } from './database.js';
import { createLayoutService } from './layoutService.js';
import { createM1Bridge } from './m1Bridge.js';
import { createOwnershipResolver } from './ownershipResolver.js';
import { createM5RealtimeHub } from './realtimeHub.js';
import { attachM5RealtimeServer } from './realtimeServer.js';
import { createM5Repositories } from './repositories.js';

export const startM5Server = async ({
  config = readM5Config(),
  authAdapter,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  const database = await openM5Database({
    databasePath: config.databasePath,
  });
  const repositories = createM5Repositories(database);
  const ownershipResolver = createOwnershipResolver({
    bp3DatabasePath: config.bp3DatabasePath,
  });
  const realtimeHub = createM5RealtimeHub();
  const layoutService = createLayoutService({
    repositories,
    ownershipResolver,
    realtimeHub,
  });
  const server = http.createServer();
  const realtime = attachM5RealtimeServer({
    server,
    config,
    hub: realtimeHub,
  });
  const m1Bridge = createM1Bridge({
    config,
    hub: realtimeHub,
    logger,
  });
  const app = createM5App({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        fetchImpl,
      }),
    layoutService,
    realtimeHub,
    m1Bridge,
    ticketService: realtime.ticketService,
  });

  server.on('request', app);
  m1Bridge.start();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    m1Bridge.stop();
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

    ownershipResolver.close();
    database.close();
  };

  return {
    close,
    config,
    layoutService,
    realtimeHub,
    repositories,
    server,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readM5Config();
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

  startM5Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m5',
          host: config.host,
          port: result.server.address().port,
          websocket: '/ws/bp4/m5/realtime',
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
