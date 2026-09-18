import cors from 'cors';
import express from 'express';
import {
  Bp4M1Error,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

const createCorsOptions = (allowedOrigins) => ({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed'));
  },
});

export const createM3App = ({
  config,
  authAdapter,
  rbac,
  worldService,
  homeService,
  playerStatusService,
  m1RealtimeClient,
  m2MetricsClient,
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '1mb' }));

  const requireUser = async (request, _response, next) => {
    try {
      const authorization = request.get('authorization') || '';
      const user = await authAdapter.authenticate(authorization);

      request.user = {
        ...user,
        authorization,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

  app.get('/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-m3',
      status: 'ok',
    });
  });

  app.get('/api/bp4/m3/health', requireUser, (request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-m3',
      status: 'ok',
      databasePath: config.databasePath,
      m1BaseUrl: config.m1BaseUrl,
      m2BaseUrl: config.m2BaseUrl,
      role: rbac.effectiveRole(request.user),
    });
  });

  app.get('/api/bp4/m3/session', requireUser, (request, response) => {
    response.json({
      user: {
        id: request.user.id,
        username: request.user.username,
        displayName: request.user.displayName,
        phase5Role: request.user.role,
      },
      opsRole: rbac.effectiveRole(request.user),
    });
  });

  app.get('/api/bp4/m3/roles', requireUser, (_request, response) => {
    response.json({
      roles: [
        {
          role: 'viewer',
          permissions: ['read'],
        },
        {
          role: 'operator',
          permissions: ['read', 'world.write', 'home.write'],
        },
        {
          role: 'admin',
          permissions: ['read', 'world.write', 'home.write', 'account.write'],
        },
      ],
    });
  });

  app.get('/api/bp4/m3/accounts', requireUser, (request, response) => {
    response.json({
      accounts: rbac.listAccounts(request.user),
    });
  });

  app.put(
    '/api/bp4/m3/accounts/:userId/role',
    requireUser,
    (request, response) => {
      response.json({
        grant: rbac.setRole({
          user: request.user,
          userId: Number(request.params.userId),
          opsRole: request.body?.opsRole,
        }),
      });
    },
  );

  app.get('/api/bp4/m3/worlds', requireUser, (request, response) => {
    response.json({
      worlds: worldService.list(request.user),
    });
  });

  app.post('/api/bp4/m3/worlds', requireUser, (request, response) => {
    response.status(201).json({
      world: worldService.create({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put('/api/bp4/m3/worlds/:worldId', requireUser, (request, response) => {
    response.json({
      world: worldService.update({
        user: request.user,
        worldId: request.params.worldId,
        fields: request.body,
      }),
    });
  });

  app.get('/api/bp4/m3/homes', requireUser, (request, response) => {
    response.json({
      homes: homeService.list({
        user: request.user,
        worldId: request.query.worldId || null,
      }),
    });
  });

  app.post('/api/bp4/m3/homes', requireUser, (request, response) => {
    response.status(201).json({
      home: homeService.create({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put('/api/bp4/m3/homes/:plotId', requireUser, (request, response) => {
    response.json({
      home: homeService.update({
        user: request.user,
        plotId: request.params.plotId,
        fields: request.body,
      }),
    });
  });

  app.get('/api/bp4/m3/players', requireUser, (request, response) => {
    response.json({
      summary: playerStatusService.summary(),
      players: playerStatusService.list(),
    });
  });

  app.get('/api/bp4/m3/integrations', requireUser, (_request, response) => {
    response.json({
      m1: m1RealtimeClient.status(),
      m2: m2MetricsClient.getSnapshot(),
    });
  });

  app.get('/api/bp4/m3/overview', requireUser, (request, response) => {
    const worlds = worldService.list(request.user);
    const homes = homeService.list({
      user: request.user,
    });

    response.json({
      worlds: worlds.length,
      homes: homes.length,
      players: playerStatusService.summary(),
      integrations: {
        m1: m1RealtimeClient.status(),
        m2: m2MetricsClient.getSnapshot(),
      },
    });
  });

  app.get('/api/bp4/m3/audit', requireUser, (request, response) => {
    rbac.requireRole(request.user, ['admin']);
    response.json({
      events: repositoriesAudit(request.app.locals.m3Repositories),
    });
  });

  app.use((_request, _response, next) => {
    next(new Bp4ValidationError('Route not found'));
  });

  app.use((error, _request, response, _next) => {
    if (
      error instanceof Bp4M1Error ||
      (Number.isInteger(error?.status) && error?.code)
    ) {
      response.status(error.status).json({
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    response.status(500).json({
      code: 'BP4_M3_INTERNAL_ERROR',
      message: 'Internal BP4 M3 service error',
    });
  });

  return app;
};

const repositoriesAudit = (repositories) =>
  repositories?.audit?.list(100) || [];
