import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createM4App } from './app.js';
import { readM4Config } from './config.js';
import { openM4Database } from './database.js';
import { createMetricsAggregator } from './metricsAggregator.js';
import { createM4Repositories } from './repositories.js';
import { createTemplateService } from './templateService.js';

export const startM4Server = async ({
  config = readM4Config(),
  authAdapter,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  const database = await openM4Database({
    databasePath: config.databasePath,
  });
  const repositories = createM4Repositories(database);
  const templateService = createTemplateService({
    repositories,
  });
  const metricsAggregator = createMetricsAggregator({
    config,
    fetchImpl,
    logger,
  });
  const app = createM4App({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        fetchImpl,
      }),
    templateService,
    metricsAggregator,
  });

  app.locals.m4Repositories = repositories;
  const server = http.createServer(app);

  metricsAggregator.start();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    metricsAggregator.stop();

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
    metricsAggregator,
    repositories,
    server,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readM4Config();
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

  startM4Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m4',
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
