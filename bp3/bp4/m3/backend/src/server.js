import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createM3App } from './app.js';
import { readM3Config } from './config.js';
import { openM3Database } from './database.js';
import { createHomeService } from './homeService.js';
import { createM1RealtimeClient } from './m1RealtimeClient.js';
import { createM2MetricsClient } from './m2MetricsClient.js';
import { createPlayerStatusService } from './playerStatusService.js';
import { createRbacService } from './rbacService.js';
import { createM3Repositories } from './repositories.js';
import { createWorldService } from './worldService.js';

export const startM3Server = async ({
  config = readM3Config(),
  authAdapter,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  const database = await openM3Database({
    databasePath: config.databasePath,
  });
  const repositories = createM3Repositories(database);
  const rbac = createRbacService({ repositories });
  const worldService = createWorldService({
    repositories,
    rbac,
  });
  const homeService = createHomeService({
    repositories,
    rbac,
  });
  const playerStatusService = createPlayerStatusService();
  const m1RealtimeClient = createM1RealtimeClient({
    config,
    logger,
    onEvent: (event) => playerStatusService.recordEvent(event),
  });
  const m2MetricsClient = createM2MetricsClient({
    config,
    fetchImpl,
    logger,
  });
  const app = createM3App({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        fetchImpl,
      }),
    rbac,
    worldService,
    homeService,
    playerStatusService,
    m1RealtimeClient,
    m2MetricsClient,
  });
  app.locals.m3Repositories = repositories;
  const server = http.createServer(app);

  m1RealtimeClient.start();
  m2MetricsClient.start();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    m1RealtimeClient.stop();
    m2MetricsClient.stop();

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
  const config = readM3Config();
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

  startM3Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m3',
          host: config.host,
          port: result.server.address().port,
          m1BaseUrl: config.m1BaseUrl,
          m2BaseUrl: config.m2BaseUrl,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
