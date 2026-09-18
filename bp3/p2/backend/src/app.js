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

const readUserIds = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value
    .split(',')
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item > 0);
};

export const createP2App = ({
  config,
  authService,
  avatarService,
  messageService,
  compatibility,
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
      service: 'virtual-utopia-bp3-p2',
      status: 'ok',
    });
  });

  app.get('/api/bp3/p2/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp3-p2',
      status: 'ok',
      databasePath: config.databasePath,
      phase5BaseUrl: config.phase5BaseUrl,
      compatibility: compatibility(),
      avatarCatalog: avatarService.listCatalog(),
    });
  });

  app.get('/api/bp3/p2/auth/me', requireUser, (request, response) => {
    const { authorization: _authorization, ...user } = request.user;

    response.json(user);
  });

  app.get('/api/bp3/p2/avatar/catalog', requireUser, (_request, response) => {
    response.json(avatarService.listCatalog());
  });

  app.get('/api/bp3/p2/avatar/state', requireUser, (request, response) => {
    const userId = request.query.userId
      ? Number.parseInt(request.query.userId, 10)
      : request.user.id;

    response.json({
      state: avatarService.getState(
        Number.isInteger(userId) && userId > 0 ? userId : request.user.id,
      ),
    });
  });

  app.get('/api/bp3/p2/avatar/states', requireUser, (request, response) => {
    const userIds = readUserIds(request.query.userIds);

    response.json({
      states: avatarService.listStates(userIds),
    });
  });

  app.put('/api/bp3/p2/avatar/state', requireUser, (request, response) => {
    response.json({
      state: avatarService.updateState({
        user: request.user,
        actionId: request.body?.actionId,
        emoteId: request.body?.emoteId,
      }),
    });
  });

  app.get(
    '/api/bp3/p2/homes/:plotId/messages',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        messages: await messageService.list({
          plotId: request.params.plotId,
          user: request.user,
          limit: request.query.limit,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/p2/homes/:plotId/messages',
    requireUser,
    asyncHandler(async (request, response) => {
      response.status(201).json({
        message: await messageService.create({
          plotId: request.params.plotId,
          user: request.user,
          content: request.body?.content,
        }),
      });
    }),
  );

  app.delete(
    '/api/bp3/p2/homes/:plotId/messages/:messageId',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        message: await messageService.remove({
          plotId: request.params.plotId,
          messageId: request.params.messageId,
          user: request.user,
        }),
      });
    }),
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
      code: 'BP3_P2_INTERNAL_ERROR',
      message: 'Internal BP3 P2 service error',
    });
  });

  return app;
};
