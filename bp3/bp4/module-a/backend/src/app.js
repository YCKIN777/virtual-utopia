import cors from 'cors';
import express from 'express';
import {
  Bp4M1Error,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const createCorsOptions = (allowedOrigins) => ({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed'));
  },
});

export const createModuleAApp = ({
  config,
  authAdapter,
  rbac,
  accessService,
  repositories,
  realtimeHub,
  ticketService,
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '256kb' }));

  const requireUser = async (request, _response, next) => {
    try {
      const authorization = request.get('authorization') || '';
      const user = await authAdapter.authenticate(authorization);

      repositories.users.upsert(user);
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
      service: 'virtual-utopia-bp4-module-a',
      status: 'ok',
    });
  });

  app.get('/api/bp4/module-a/health', requireUser, (request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-module-a',
      status: 'ok',
      databasePath: config.databasePath,
      role: rbac.effectiveRole(request.user),
      realtime: realtimeHub.stats(),
    });
  });

  app.get('/api/bp4/module-a/session', requireUser, (request, response) => {
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

  app.get('/api/bp4/module-a/users', requireUser, (request, response) => {
    rbac.requireRole(request.user, ['operator', 'admin']);
    response.json({
      users: repositories.users.list(),
    });
  });

  app.get('/api/bp4/module-a/homes', requireUser, (request, response) => {
    response.json({
      homes: accessService.list(request.user),
      summary: accessService.summary(request.user),
    });
  });

  app.get(
    '/api/bp4/module-a/homes/:plotId/access',
    requireUser,
    (request, response) => {
      response.json({
        home: accessService.getAccess(request.user, request.params.plotId),
      });
    },
  );

  app.put(
    '/api/bp4/module-a/homes/:plotId/access',
    requireUser,
    (request, response) => {
      response.json(
        accessService.updateAccess({
          user: request.user,
          plotId: request.params.plotId,
          accessMode: request.body?.accessMode,
          friendUserIds: request.body?.friendUserIds,
        }),
      );
    },
  );

  app.put(
    '/api/bp4/module-a/homes/:plotId/owner',
    requireUser,
    (request, response) => {
      response.json(
        accessService.updateOwner({
          user: request.user,
          plotId: request.params.plotId,
          ownerUserId: request.body?.ownerUserId,
          ownerUsername: request.body?.ownerUsername,
        }),
      );
    },
  );

  app.get(
    '/api/bp4/module-a/homes/:plotId/my-access',
    requireUser,
    (request, response) => {
      response.json(
        accessService.evaluateCurrentUser({
          user: request.user,
          plotId: request.params.plotId,
          action: request.query.action || 'view',
        }),
      );
    },
  );

  app.post(
    '/api/bp4/module-a/homes/:plotId/evaluate',
    requireUser,
    (request, response) => {
      response.json(
        accessService.evaluateTargetUser({
          user: request.user,
          plotId: request.params.plotId,
          targetUserId: request.body?.targetUserId,
          action: request.body?.action || 'view',
        }),
      );
    },
  );

  app.get('/api/bp4/module-a/events', requireUser, (request, response) => {
    response.json({
      events: accessService.listEvents({
        user: request.user,
        plotId: request.query.plotId || null,
        limit: Number(request.query.limit) || 100,
      }),
    });
  });

  app.get('/api/bp4/module-a/audit', requireUser, (request, response) => {
    response.json({
      events: accessService.listAudit(request.user),
    });
  });

  app.post(
    '/api/bp4/module-a/realtime/ticket',
    requireUser,
    (request, response) => {
      response.json(
        ticketService.createTicket({
          user: request.user,
          scopes: ['realtime'],
          channelIds: request.body?.channelIds || ['world-main'],
        }),
      );
    },
  );

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
      code: 'BP4_MODULE_A_INTERNAL_ERROR',
      message: 'Internal module A service error',
    });
  });

  return app;
};
