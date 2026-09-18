import cors from 'cors';
import express from 'express';
import {
  Bp4M1Error,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';
import { homes } from '../../../../../frontend/src/virtual-utopia/webgl/worldLayout.js';

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

export const createM5App = ({
  config,
  authAdapter,
  layoutService,
  realtimeHub,
  m1Bridge,
  ticketService,
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '1mb' }));

  const requireUser = async (request, _response, next) => {
    try {
      const authorization = request.get('authorization') || '';

      request.user = {
        ...(await authAdapter.authenticate(authorization)),
        authorization,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

  app.get('/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-m5',
      status: 'ok',
    });
  });

  app.get('/api/bp4/m5/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp4-m5',
      status: 'ok',
      databasePath: config.databasePath,
      m1Bridge: m1Bridge.status(),
      realtime: realtimeHub.stats(),
    });
  });

  app.get('/api/bp4/m5/session', requireUser, (request, response) => {
    response.json({
      user: {
        id: request.user.id,
        username: request.user.username,
        displayName: request.user.displayName,
        role: request.user.role,
      },
    });
  });

  app.post('/api/bp4/m5/realtime/ticket', requireUser, (request, response) => {
    response.json(
      ticketService.createTicket({
        user: request.user,
        scopes: ['realtime'],
        channelIds: request.body?.channelIds || ['world-main'],
      }),
    );
  });

  app.get('/api/bp4/m5/plots', requireUser, (_request, response) => {
    response.json({
      plots: homes.map((home) => ({
        id: home.id,
        number: home.number,
        group: home.group,
        x: home.x,
        y: home.y,
        z: home.z,
        view: home.view,
      })),
    });
  });

  app.get(
    '/api/bp4/m5/homes/:plotId/layout',
    requireUser,
    (request, response) => {
      response.json({
        layout: layoutService.getLayout(request.user, request.params.plotId),
      });
    },
  );

  app.put(
    '/api/bp4/m5/homes/:plotId/layout',
    requireUser,
    (request, response) => {
      response.json(
        layoutService.saveLayout({
          user: request.user,
          plotId: request.params.plotId,
          items: request.body?.items,
        }),
      );
    },
  );

  app.get(
    '/api/bp4/m5/homes/:plotId/events',
    requireUser,
    (request, response) => {
      response.json({
        events: layoutService.listEvents(
          request.params.plotId,
          Number(request.query.afterSequence) || 0,
        ),
      });
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
      code: 'BP4_M5_INTERNAL_ERROR',
      message: 'Internal BP4 M5 service error',
    });
  });

  return app;
};
