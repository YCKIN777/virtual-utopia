import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePhase5Database } from './database.js';
import { readPhase5Config, validatePhase5ServiceConfig } from './config.js';
import { openPhase5Database } from './database.js';
import { createPhase5App, startPhase5HttpServer } from './httpServer.js';
import { createRepositories } from './repositories.js';

export const startPhase5Server = async ({
  config = readPhase5Config(),
} = {}) => {
  validatePhase5ServiceConfig(config);

  const database = await openPhase5Database(config);
  const repositories = createRepositories(database);
  const app = createPhase5App({
    repositories,
    config,
    database,
  });
  const server = await startPhase5HttpServer({
    app,
    port: config.port,
  });

  const close = async () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        closePhase5Database(database);
        resolve();
      });
    });

  return {
    app,
    server,
    database,
    repositories,
    close,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readPhase5Config();
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

  startPhase5Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-phase5',
          port: result.server.address().port,
          databasePath: config.databasePath,
          sessionStorageMode: config.sessionStorageMode,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
