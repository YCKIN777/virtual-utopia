import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createPhase5AuthAdapter } from '../../../m1/backend/src/authAdapter.js';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { homes as worldHomes } from '../../../../../frontend/src/virtual-utopia/webgl/worldLayout.js';
import { createHomeAccessService } from './accessService.js';
import { createModuleAApp } from './app.js';
import { readModuleAConfig } from './config.js';
import { openModuleADatabase } from './database.js';
import { attachModuleARealtimeServer } from './realtimeServer.js';
import { createModuleARepositories } from './repositories.js';
import { createModuleARbacService } from './rbacService.js';

const seedHomes = (repositories) => {
  worldHomes.forEach((home) => {
    repositories.homes.ensure(home.id);
  });
};

const hydrateOwnersFromBp3 = ({ bp3DatabasePath, repositories }) => {
  if (!existsSync(bp3DatabasePath)) {
    return 0;
  }

  const database = new DatabaseSync(bp3DatabasePath, {
    readOnly: true,
  });
  let imported = 0;

  try {
    const table = database
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name = 'bp3_plot_owners'`,
      )
      .get();

    if (!table) {
      return 0;
    }

    const rows = database
      .prepare(
        `SELECT plot_id, user_id
         FROM bp3_plot_owners`,
      )
      .all();

    rows.forEach((row) => {
      const current = repositories.homes.get(row.plot_id);

      if (current && current.ownerUserId === null) {
        repositories.homes.updateOwner({
          plotId: row.plot_id,
          ownerUserId: Number(row.user_id),
          ownerUsername: `user-${row.user_id}`,
        });
        imported += 1;
      }
    });
  } finally {
    database.close();
  }

  return imported;
};

export const startModuleAServer = async ({
  config = readModuleAConfig(),
  authAdapter,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) => {
  const database = await openModuleADatabase({
    databasePath: config.databasePath,
  });
  const repositories = createModuleARepositories(database);

  seedHomes(repositories);
  const hydratedOwners = hydrateOwnersFromBp3({
    bp3DatabasePath: config.bp3DatabasePath,
    repositories,
  });
  const rbac = createModuleARbacService();
  const realtimeHub = createRealtimeHub();
  const server = http.createServer();
  const realtime = attachModuleARealtimeServer({
    server,
    config,
    hub: realtimeHub,
  });
  const accessService = createHomeAccessService({
    repositories,
    rbac,
    realtimeHub,
  });
  const app = createModuleAApp({
    config,
    authAdapter:
      authAdapter ||
      createPhase5AuthAdapter({
        phase5BaseUrl: config.phase5BaseUrl,
        fetchImpl,
      }),
    rbac,
    accessService,
    repositories,
    realtimeHub,
    ticketService: realtime.ticketService,
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
    accessService,
    close,
    config,
    hydratedOwners,
    repositories,
    server,
  };
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = readModuleAConfig();
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

  startModuleAServer({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp4-module-a',
          host: config.host,
          port: result.server.address().port,
          websocket: '/ws/bp4/realtime',
          hydratedOwners: result.hydratedOwners,
        }),
      );
    })
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}
