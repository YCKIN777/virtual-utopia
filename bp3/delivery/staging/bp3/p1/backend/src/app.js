import cors from 'cors';
import express from 'express';
import { Bp3Error, Bp3ValidationError } from '../../../backend/src/errors.js';

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

const readLimit = (value, fallback = 100) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 500)
    : fallback;
};

export const createP1App = ({
  config,
  authService,
  eventService,
  gameplayService,
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '1mb' }));

  const requireUser = async (request, _response, next) => {
    try {
      const authorization = request.get('authorization') || '';
      const user = await authService.authenticate(authorization);

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
      service: 'virtual-utopia-bp3-p1',
      status: 'ok',
    });
  });

  app.get('/api/bp3/p1/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp3-p1',
      status: 'ok',
      databasePath: config.databasePath,
      phase5BaseUrl: config.phase5BaseUrl,
    });
  });

  app.get('/api/bp3/p1/auth/me', requireUser, (request, response) => {
    const { authorization: _authorization, ...user } = request.user;

    response.json(user);
  });

  app.get('/api/bp3/p1/catalog/items', requireUser, (_request, response) => {
    response.json({
      items: gameplayService.listCatalog(),
    });
  });

  app.get('/api/bp3/p1/events', requireUser, (request, response) => {
    const statuses =
      request.query.status === 'all'
        ? null
        : request.query.status
          ? String(request.query.status).split(',')
          : ['active', 'scheduled'];

    response.json({
      events: eventService.list({ statuses }),
    });
  });

  app.get('/api/bp3/p1/events/:eventId', requireUser, (request, response) => {
    response.json({
      event: eventService.get(request.params.eventId),
    });
  });

  app.post('/api/bp3/p1/events', requireUser, (request, response) => {
    response.status(201).json({
      event: eventService.create({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put('/api/bp3/p1/events/:eventId', requireUser, (request, response) => {
    response.json({
      event: eventService.update({
        eventId: request.params.eventId,
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.post(
    '/api/bp3/p1/events/:eventId/activate',
    requireUser,
    (request, response) => {
      response.json({
        event: eventService.activate({
          eventId: request.params.eventId,
          user: request.user,
        }),
      });
    },
  );

  app.post(
    '/api/bp3/p1/events/:eventId/end',
    requireUser,
    (request, response) => {
      response.json({
        event: eventService.end({
          eventId: request.params.eventId,
          user: request.user,
        }),
      });
    },
  );

  app.get('/api/bp3/p1/tasks', requireUser, (request, response) => {
    response.json({
      tasks: gameplayService.listTasks({
        user: request.user,
      }),
    });
  });

  app.post('/api/bp3/p1/tasks', requireUser, (request, response) => {
    response.status(201).json({
      task: gameplayService.createTask({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put('/api/bp3/p1/tasks/:taskId', requireUser, (request, response) => {
    response.json({
      task: gameplayService.updateTask({
        taskId: request.params.taskId,
        user: request.user,
        fields: request.body,
      }),
    });
  });

  app.post(
    '/api/bp3/p1/tasks/:taskId/accept',
    requireUser,
    (request, response) => {
      response.json({
        instance: gameplayService.acceptTask({
          taskId: request.params.taskId,
          user: request.user,
        }),
      });
    },
  );

  app.post(
    '/api/bp3/p1/tasks/:taskId/progress',
    requireUser,
    (request, response) => {
      response.json({
        instance: gameplayService.updateTaskProgress({
          taskId: request.params.taskId,
          targetUserId: request.body?.targetUserId,
          user: request.user,
          progress: request.body?.progress,
        }),
      });
    },
  );

  app.post(
    '/api/bp3/p1/tasks/:taskId/claim',
    requireUser,
    (request, response) => {
      response.json(
        gameplayService.claimTask({
          taskId: request.params.taskId,
          user: request.user,
        }),
      );
    },
  );

  app.get('/api/bp3/p1/resources', requireUser, (_request, response) => {
    response.json({
      resources: gameplayService.listResourceNodes(),
    });
  });

  app.post('/api/bp3/p1/resources', requireUser, (request, response) => {
    response.status(201).json({
      resource: gameplayService.createResourceNode({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put('/api/bp3/p1/resources/:nodeId', requireUser, (request, response) => {
    response.json({
      resource: gameplayService.updateResourceNode({
        nodeId: request.params.nodeId,
        user: request.user,
        fields: request.body,
      }),
    });
  });

  app.post(
    '/api/bp3/p1/resources/:nodeId/collect',
    requireUser,
    (request, response) => {
      response.json(
        gameplayService.collectResource({
          nodeId: request.params.nodeId,
          user: request.user,
          position: request.body?.position,
        }),
      );
    },
  );

  app.get('/api/bp3/p1/inventory', requireUser, (request, response) => {
    response.json({
      inventory: gameplayService.getInventory(request.user.id),
    });
  });

  app.get(
    '/api/bp3/p1/inventory/transactions',
    requireUser,
    (request, response) => {
      response.json({
        transactions: gameplayService.listInventoryTransactions({
          user: request.user,
          limit: readLimit(request.query.limit),
        }),
      });
    },
  );

  app.post('/api/bp3/p1/inventory/grant', requireUser, (request, response) => {
    response.json(
      gameplayService.grantItem({
        user: request.user,
        targetUserId: request.body?.targetUserId,
        itemId: request.body?.itemId,
        quantity: request.body?.quantity,
        reason: request.body?.reason,
        idempotencyKey: request.body?.idempotencyKey || null,
      }),
    );
  });

  app.post(
    '/api/bp3/p1/inventory/consume',
    requireUser,
    (request, response) => {
      response.json(
        gameplayService.consumeItem({
          user: request.user,
          itemId: request.body?.itemId,
          quantity: request.body?.quantity,
          reason: request.body?.reason,
        }),
      );
    },
  );

  app.use((_request, _response, next) => {
    next(new Bp3ValidationError('Route not found'));
  });

  app.use((error, _request, response, _next) => {
    if (
      error instanceof Bp3Error ||
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
      code: 'BP3_P1_INTERNAL_ERROR',
      message: 'Internal BP3 P1 service error',
    });
  });

  return app;
};
