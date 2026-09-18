import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from './authAdapter.js';
import { readM1Config, validateM1Config } from './config.js';
import { createRealtimeServer } from './realtimeServer.js';

export const startM1Server = async ({
  config = readM1Config(),
  authAdapter,
} = {}) => {
  validateM1Config(config);
  const realtime = createRealtimeServer({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        timeoutMs: config.requestTimeoutMs,
      }),
  });

  await realtime.start();

  return {
    config,
    realtime,
    close: realtime.close,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readM1Config();
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

  startM1Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m1',
          host: config.host,
          port: result.realtime.server.address().port,
          websocket: '/ws/bp4/realtime',
          databaseConfigured: Boolean(config.databaseUrl),
          sqlitePath: config.sqlitePath,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
