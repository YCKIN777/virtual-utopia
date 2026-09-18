import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthService } from '../../../backend/src/auth.js';
import { createRepositories } from '../../../backend/src/repositories.js';
import { createP1App } from './app.js';
import { readP1Config, validateP1Config } from './config.js';
import { openP1Database } from './database.js';
import { createEventService } from './eventService.js';
import { createGameplayService } from './gameplayService.js';
import { createP1Repositories } from './repositories.js';

export const startP1Server = async ({
  config = readP1Config(),
  fetchImpl = globalThis.fetch,
} = {}) => {
  validateP1Config(config);

  const databaseClient = await openP1Database({
    databasePath: config.databasePath,
  });
  const p0Repositories = createRepositories(databaseClient);
  const repositories = createP1Repositories(databaseClient);
  const authService = createAuthService({
    config,
    repositories: p0Repositories,
    fetchImpl,
  });
  const eventService = createEventService({
    repositories,
  });
  const gameplayService = createGameplayService({
    config,
    repositories,
  });
  const app = createP1App({
    config,
    authService,
    eventService,
    gameplayService,
  });
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
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

    databaseClient.close();
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
  const config = readP1Config();
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

  startP1Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp3-p1',
          host: config.host,
          port: result.server.address().port,
          databasePath: config.databasePath,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
