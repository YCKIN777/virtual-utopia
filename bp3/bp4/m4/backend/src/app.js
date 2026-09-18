import cors from 'cors';
import express from 'express';
import {
  Bp4ForbiddenError,
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

export const createM4App = ({
  config,
  authAdapter,
  templateService,
  metricsAggregator,
}) => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '2mb' }));

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
      service: 'virtual-utopia-bp4-m4',
      status: 'ok',
    });
  });

  app.get('/api/bp4/m4/session', requireUser, (request, response) => {
    response.json({
      user: {
        id: request.user.id,
        username: request.user.username,
        displayName: request.user.displayName,
        role: request.user.role,
      },
    });
  });

  app.get('/api/bp4/m4/templates', requireUser, (request, response) => {
    response.json({
      templates: templateService.list({
        templateType: request.query.type || null,
        status: request.query.status || null,
      }),
    });
  });

  app.get(
    '/api/bp4/m4/templates/:templateId',
    requireUser,
    (request, response) => {
      response.json({
        template: templateService.get(request.params.templateId),
      });
    },
  );

  app.post('/api/bp4/m4/templates', requireUser, (request, response) => {
    response.status(201).json({
      template: templateService.create({
        user: request.user,
        ...request.body,
      }),
    });
  });

  app.put(
    '/api/bp4/m4/templates/:templateId',
    requireUser,
    (request, response) => {
      response.json({
        template: templateService.update({
          user: request.user,
          id: request.params.templateId,
          fields: request.body,
        }),
      });
    },
  );

  app.post(
    '/api/bp4/m4/templates/:templateId/publish',
    requireUser,
    (request, response) => {
      response.json({
        template: templateService.publish({
          user: request.user,
          id: request.params.templateId,
        }),
      });
    },
  );

  app.get(
    '/api/bp4/m4/dashboard',
    requireUser,
    asyncHandler(async (_request, response) => {
      response.json({
        templates: templateService.stats(),
        metrics: metricsAggregator.getSnapshot(),
      });
    }),
  );

  app.get('/api/bp4/m4/audit', requireUser, (request, response) => {
    if (request.user.role !== 'admin') {
      throw new Bp4ForbiddenError(
        'Only administrators can read template audit',
      );
    }

    response.json({
      events: auditEvents(request.app.locals.m4Repositories),
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
      code: 'BP4_M4_INTERNAL_ERROR',
      message: 'Internal BP4 M4 service error',
    });
  });

  return app;
};

const auditEvents = (repositories) => repositories?.audit?.list(100) || [];
