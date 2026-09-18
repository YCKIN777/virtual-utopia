import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthService } from '../../../backend/src/auth.js';
import { createHomeAccessService } from '../../../backend/src/accessService.js';
import { createRepositories } from '../../../backend/src/repositories.js';
import { createP2App } from './app.js';
import { createAvatarService } from './avatarService.js';
import { readP2Config, validateP2Config } from './config.js';
import { openP2Database } from './database.js';
import { createMessageService } from './messageService.js';
import { createP2Repositories } from './repositories.js';

const getCompatibility = (database) => {
  const names = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           'bp3_plot_owners',
           'bp3_voice_channels',
           'bp3_voice_participants',
           'bp3_home_access_rules',
           'bp3_home_visitors',
           'bp3_home_access_requests',
           'bp3_home_access_grants',
           'bp3_home_visit_logs',
           'bp3_p1_world_events',
           'bp3_p1_inventories',
           'bp3_p2_avatar_states',
           'bp3_p2_home_messages'
         )`,
    )
    .all()
    .map((row) => row.name);

  return {
    m1Tables: names.filter((name) =>
      [
        'bp3_plot_owners',
        'bp3_voice_channels',
        'bp3_voice_participants',
        'bp3_home_access_rules',
        'bp3_home_visitors',
        'bp3_home_access_requests',
        'bp3_home_access_grants',
        'bp3_home_visit_logs',
      ].includes(name),
    ),
    m2Tables: names.filter((name) =>
      ['bp3_p1_world_events', 'bp3_p1_inventories'].includes(name),
    ),
    p2Tables: names.filter((name) =>
      ['bp3_p2_avatar_states', 'bp3_p2_home_messages'].includes(name),
    ),
  };
};

export const startP2Server = async ({
  config = readP2Config(),
  fetchImpl = globalThis.fetch,
} = {}) => {
  validateP2Config(config);

  const databaseClient = await openP2Database({
    databasePath: config.databasePath,
  });
  const p0Repositories = createRepositories(databaseClient);
  const repositories = createP2Repositories(databaseClient);
  const authService = createAuthService({
    config,
    repositories: p0Repositories,
    fetchImpl,
  });
  const accessService = createHomeAccessService({
    config,
    repositories: p0Repositories,
    authService,
  });
  const avatarService = createAvatarService({
    repositories,
  });
  const messageService = createMessageService({
    config,
    repositories,
    accessService,
  });
  const app = createP2App({
    config,
    authService,
    avatarService,
    messageService,
    compatibility: () => getCompatibility(databaseClient.database),
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
  const config = readP2Config();
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

  startP2Server({ config })
    .then((result) => {
      handle = result;
      console.log(
        JSON.stringify({
          service: 'virtual-utopia-bp3-p2',
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
