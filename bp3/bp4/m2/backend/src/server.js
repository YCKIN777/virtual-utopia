import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { createBackupService } from './backupService.js';
import { readM2Config, validateM2Config } from './config.js';
import { createMediaCluster } from './mediaCluster.js';
import { createMediaSignaling } from './mediaSignaling.js';
import { createMonitor, createStructuredLogger } from './monitoring.js';
import { createRealtimeClusterServer } from './realtimeClusterServer.js';
import { createTurnService } from './turnService.js';

export const startM2Server = async ({
  config = readM2Config(),
  authAdapter,
  cluster,
  turnService,
  backupService,
  logger = createStructuredLogger(),
  monitor = createMonitor(),
} = {}) => {
  validateM2Config(config);
  const mediaCluster =
    cluster ||
    createMediaCluster({
      config: config.cluster,
      logger,
    });
  const turn =
    turnService ||
    createTurnService({
      config: config.turn,
      logger,
    });
  const backups =
    backupService ||
    createBackupService({
      config,
      logger,
    });

  await turn.start();
  await mediaCluster.initialize();
  const hub = createRealtimeHub();

  const mediaSignaling = createMediaSignaling({
    cluster: mediaCluster,
    hub,
    turnService: turn,
    monitor,
    logger,
  });
  const realtime = createRealtimeClusterServer({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        timeoutMs: config.requestTimeoutMs,
      }),
    cluster: mediaCluster,
    turnService: turn,
    mediaSignaling,
    monitor,
    logger,
    backupService: backups,
    hub,
  });

  await realtime.start();

  return {
    backupService: backups,
    cluster: mediaCluster,
    close: async () => {
      await realtime.close();
      await turn.stop();
      await mediaCluster.close();
    },
    config,
    monitor,
    realtime,
    turnService: turn,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readM2Config();
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

  startM2Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-m2',
          host: config.host,
          port: result.realtime.server.address().port,
          websocket: '/ws/bp4/realtime',
          workers: config.cluster.workers,
          turnPort: config.turn.listeningPort,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
