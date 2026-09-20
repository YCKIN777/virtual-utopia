import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuditStore } from './auditStore.js';
import { createPhase6App } from './app.js';
import { createGuestbookStore } from './guestbookStore.js';
import { createPlotAssignmentStore } from './plotAssignmentStore.js';
import { createResidentCardStore } from './residentCardStore.js';
import { createResidentSocialStore } from './residentSocialStore.js';
import { createVisitorQuotaStore } from './visitorQuotaStore.js';
import { readPhase6Config, validatePhase6Config } from './config.js';
import { createGuardedApp } from '../runtime/guard.js';

export const startPhase6Server = async ({
  config = readPhase6Config(),
} = {}) => {
  validatePhase6Config(config);
  const auditStore = createAuditStore(config.auditDatabasePath);
  const visitorQuotaStore = createVisitorQuotaStore({
    databasePath: config.quotaDatabasePath,
  });
  const plotAssignmentStore = createPlotAssignmentStore({
    databasePath: config.plotDatabasePath,
  });
  const residentCardStore = createResidentCardStore({
    databasePath: config.cardDatabasePath,
  });
  const guestbookStore = createGuestbookStore({
    databasePath: config.guestbookDatabasePath,
  });
  const residentSocialStore = createResidentSocialStore({
    databasePath: config.socialDatabasePath,
  });
  const frozenApp = createPhase6App({
    config,
    auditStore,
    visitorQuotaStore,
    plotAssignmentStore,
    residentCardStore,
    guestbookStore,
    residentSocialStore,
  });
  const { app } = createGuardedApp({
    service: 'virtual-utopia-phase6',
    app: frozenApp,
    options: {
      isProduction: process.env.NODE_ENV === 'production',
      rateLimit: {
        maxRequests: Number(process.env.GUARD_RATE_MAX) || 300,
      },
    },
  });
  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(config.port, config.host);

    listeningServer.once('listening', () => resolve(listeningServer));
    listeningServer.once('error', reject);
  });

  const close = async () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        auditStore.close();
        visitorQuotaStore.close();
        plotAssignmentStore.close();
        residentCardStore.close();
        guestbookStore.close();
        residentSocialStore.close();

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

  return {
    app,
    server,
    auditStore,
    close,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readPhase6Config();
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

  startPhase6Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-phase6',
          host: config.host,
          port: result.server.address().port,
          auditDatabasePath: config.auditDatabasePath,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
