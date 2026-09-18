import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBp3App } from './app.js';
import { createAuthService } from './auth.js';
import { createHomeAccessService } from './accessService.js';
import { readBp3Config, validateBp3Config } from './config.js';
import { createDatabaseClient, openBp3Database } from './database.js';
import { createMediasoupAdapter } from './mediasoupAdapter.js';
import { createRepositories } from './repositories.js';
import { createVoiceSignalingServer } from './signaling.js';
import { createVoiceService } from './voiceService.js';

export const startBp3Server = async ({
  config = readBp3Config(),
  fetchImpl = globalThis.fetch,
  mediasoupAdapter: providedMediasoupAdapter,
  logger = console,
} = {}) => {
  validateBp3Config(config);

  const database = await openBp3Database({
    databasePath: config.databasePath,
  });
  const databaseClient = createDatabaseClient(database);
  const repositories = createRepositories(databaseClient);
  const authService = createAuthService({
    config,
    repositories,
    fetchImpl,
  });
  const accessService = createHomeAccessService({
    config,
    repositories,
    authService,
  });
  const voiceService = createVoiceService({
    config,
    repositories,
  });
  const mediasoup =
    providedMediasoupAdapter ||
    createMediasoupAdapter({
      config: config.mediasoup,
      logger,
    });
  const signaling = createVoiceSignalingServer({
    authSecret: config.authSecret,
    voiceService,
    mediasoupAdapter: mediasoup,
    repositories,
    logger,
  });
  const app = createBp3App({
    config,
    repositories,
    authService,
    accessService,
    voiceService,
    signaling,
    mediasoup,
  });
  const server = http.createServer(app);

  signaling.attach(server);
  await mediasoup.initialize();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const close = async () => {
    await signaling.close().catch(() => null);
    await mediasoup.close().catch(() => null);

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
    accessService,
    app,
    authService,
    close,
    config,
    mediasoup,
    repositories,
    server,
    signaling,
    voiceService,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readBp3Config();
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

  startBp3Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp3',
          host: config.host,
          port: result.server.address().port,
          databasePath: config.databasePath,
          signalingPath: '/ws/bp3/voice/signaling',
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
