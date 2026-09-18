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

const readChannel = (bodyOrQuery, user) => {
  if (bodyOrQuery.channel && typeof bodyOrQuery.channel === 'object') {
    return bodyOrQuery.channel;
  }

  const type = bodyOrQuery.channelType;

  if (type === 'world') {
    return {
      type: 'world',
    };
  }

  if (type === 'home') {
    return {
      type: 'home',
      plotId: bodyOrQuery.plotId,
    };
  }

  if (type === 'direct') {
    return {
      type: 'direct',
      targetUserId: bodyOrQuery.targetUserId,
      id: bodyOrQuery.channelId,
      userId: user.id,
    };
  }

  return bodyOrQuery.channel;
};

export const createModuleBApp = ({
  config,
  authAdapter,
  repositories,
  chatService,
  realtimeHub,
  ticketService,
  ticketContextStore,
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
      service: 'virtual-utopia-bp4-module-b',
      status: 'ok',
    });
  });

  app.get('/api/bp4/module-b/health', requireUser, (request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-module-b',
      status: 'ok',
      databasePath: config.databasePath,
      moduleABaseUrl: config.moduleABaseUrl,
      realtime: realtimeHub.stats(),
    });
  });

  app.get('/api/bp4/module-b/session', requireUser, (request, response) => {
    response.json({
      user: {
        id: request.user.id,
        username: request.user.username,
        displayName: request.user.displayName,
        role: request.user.role,
      },
    });
  });

  app.get('/api/bp4/module-b/users', requireUser, (_request, response) => {
    response.json({
      users: repositories.users.list(),
    });
  });

  app.get(
    '/api/bp4/module-b/messages',
    requireUser,
    async (request, response) => {
      response.json(
        await chatService.listHistory({
          user: request.user,
          authorization: request.user.authorization,
          channel: readChannel(request.query, request.user),
          limit: Number(request.query.limit) || 50,
        }),
      );
    },
  );

  app.post(
    '/api/bp4/module-b/messages',
    requireUser,
    async (request, response) => {
      response.status(201).json(
        await chatService.sendMessage({
          user: request.user,
          authorization: request.user.authorization,
          channel: readChannel(request.body, request.user),
          content: request.body?.content,
          clientMessageId: request.body?.clientMessageId,
        }),
      );
    },
  );

  app.post(
    '/api/bp4/module-b/messages/:messageId/recall',
    requireUser,
    async (request, response) => {
      response.json(
        await chatService.recallMessage({
          user: request.user,
          authorization: request.user.authorization,
          messageId: request.params.messageId,
        }),
      );
    },
  );

  app.get('/api/bp4/module-b/audit', requireUser, (request, response) => {
    response.json({
      events: chatService.listAudit(request.user),
    });
  });

  app.post(
    '/api/bp4/module-b/realtime/ticket',
    requireUser,
    (request, response) => {
      const ticket = ticketService.createTicket({
        user: request.user,
        scopes: ['realtime'],
        channelIds: [],
      });

      ticketContextStore.set(ticket.ticket, {
        authorization: request.user.authorization,
      });
      response.json(ticket);
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
      code: 'BP4_MODULE_B_INTERNAL_ERROR',
      message: 'Internal module B service error',
    });
  });

  return app;
};
