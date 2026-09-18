import Turn from 'node-turn';

export const createTurnService = ({ config, logger = console }) => {
  let server = null;
  let startedAt = null;

  const start = async () => {
    if (server) {
      return;
    }

    const externalIps = config.externalIp
      ? {
          [config.relayIp]: config.externalIp,
          default: config.externalIp,
        }
      : undefined;

    server = new Turn({
      listeningPort: config.listeningPort,
      listeningIps: [config.listeningIp],
      relayIps: [config.relayIp],
      externalIps,
      minPort: config.relayMinPort,
      maxPort: config.relayMaxPort,
      authMech: 'long-term',
      credentials: {
        [config.username]: config.password,
      },
      realm: 'virtual-utopia-bp4',
      maxAllocateLifetime: config.credentialTtlSeconds,
      debugLevel: 'OFF',
    });

    await new Promise((resolve, reject) => {
      try {
        server.start();
        startedAt = new Date().toISOString();
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    logger.info?.('turn_started', {
      listeningIp: config.listeningIp,
      listeningPort: config.listeningPort,
      relayIp: config.relayIp,
    });
  };

  const stop = async () => {
    if (!server) {
      return;
    }

    server.stop();
    server = null;
    startedAt = null;
    logger.info?.('turn_stopped');
  };

  const healthCheck = () => ({
    running: Boolean(server),
    startedAt,
    listeningIp: config.listeningIp,
    listeningPort: config.listeningPort,
    relayIp: config.relayIp,
    relayPortRange: {
      min: config.relayMinPort,
      max: config.relayMaxPort,
    },
  });

  const getIceServers = () => [
    {
      urls: [`stun:${config.listeningIp}:${config.listeningPort}`],
    },
    {
      urls: [
        `turn:${config.listeningIp}:${config.listeningPort}?transport=udp`,
        `turn:${config.listeningIp}:${config.listeningPort}?transport=tcp`,
      ],
      username: config.username,
      credential: config.password,
    },
  ];

  return Object.freeze({
    getIceServers,
    healthCheck,
    start,
    stop,
  });
};
