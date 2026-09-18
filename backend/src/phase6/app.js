import cors from 'cors';
import express from 'express';
import { createAuditStore } from './auditStore.js';
import {
  Phase6Error,
  Phase6ForbiddenError,
  Phase6UnauthorizedError,
  Phase6ValidationError,
} from './errors.js';
import { createGatewayService } from './gatewayService.js';
import { createHttpClient } from './httpClient.js';
import { parseMultipart } from './multipart.js';
import { createPresenceStore } from './presenceStore.js';
import { createUploadService } from './uploadService.js';

const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

const readPagination = (query) => ({
  limit: Number.parseInt(query.limit, 10) || 100,
  offset: Number.parseInt(query.offset, 10) || 0,
});

const createCorsOptions = (allowedOrigins) => ({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Phase6ForbiddenError('origin is not allowed'));
  },
});

const audit = (
  auditStore,
  { request, user, action, result, resourceType, resourceId, details },
) => {
  try {
    auditStore.record({
      actorUserId: user?.id ?? null,
      actorUsername: user?.username ?? null,
      action,
      result,
      resourceType,
      resourceId,
      details,
      ipAddress: request.ip,
      userAgent: request.get('user-agent') || null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        service: 'virtual-utopia-phase6',
        event: 'audit_write_failed',
        action,
        message: error.message,
      }),
    );
  }
};

const requireAuthorization = (request) => {
  const authorization = request.get('authorization');

  if (!authorization) {
    throw new Phase6UnauthorizedError('Authorization header is required');
  }

  return authorization;
};

const readPresencePosition = (body) => {
  const values = {
    x: Number(body?.x),
    y: Number(body?.y),
    z: Number(body?.z),
    rotation: Number(body?.rotation) || 0,
    animationState: body?.animationState === 'walk' ? 'walk' : 'idle',
  };

  if (
    !Number.isFinite(values.x) ||
    !Number.isFinite(values.y) ||
    !Number.isFinite(values.z)
  ) {
    throw new Phase6ValidationError(
      'presence position must contain finite x, y and z',
    );
  }

  return {
    x: Math.max(-220, Math.min(220, values.x)),
    y: Math.max(-20, Math.min(90, values.y)),
    z: Math.max(-220, Math.min(220, values.z)),
    rotation: ((values.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    animationState: values.animationState,
  };
};

export const createPhase6App = ({
  config,
  auditStore = createAuditStore(config.auditDatabasePath),
  fetchImpl = globalThis.fetch,
}) => {
  const httpClient = createHttpClient({
    fetchImpl,
    timeoutMs: config.requestTimeoutMs,
  });
  const uploadService = createUploadService({
    config,
    httpClient,
  });
  const gateway = createGatewayService({
    config,
    httpClient,
    uploadService,
  });
  const presenceStore = createPresenceStore();
  const app = express();
  app.locals.presenceStore = presenceStore;

  app.disable('x-powered-by');
  app.use(cors(createCorsOptions(config.allowedOrigins)));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-phase6',
      status: 'ok',
    });
  });

  app.get('/api/phase6/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-phase6',
      status: 'ok',
      phase5BaseUrl: config.phase5BaseUrl,
      ragBaseUrl: config.ragBaseUrl,
    });
  });

  app.post(
    '/api/phase6/auth/login',
    asyncHandler(async (request, response) => {
      const username =
        typeof request.body?.username === 'string'
          ? request.body.username.trim()
          : null;

      try {
        const result = await gateway.login({
          username: request.body?.username,
          password: request.body?.password,
        });

        audit(auditStore, {
          request,
          user: result.user,
          action: 'login',
          result: 'success',
          details: {
            username,
          },
        });
        response.json(result);
      } catch (error) {
        audit(auditStore, {
          request,
          action: 'login',
          result: 'failure',
          details: {
            username,
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
    }),
  );

  app.get(
    '/api/phase6/auth/me',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      response.json(await gateway.authenticate(authorization));
    }),
  );

  app.post(
    '/api/phase6/auth/logout',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const result = await gateway.logout(authorization);

      audit(auditStore, {
        request,
        user,
        action: 'logout',
        result: 'success',
      });
      response.json(result);
    }),
  );

  app.get(
    '/api/phase6/world-state',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const result = await gateway.getWorldState({ authorization });

      audit(auditStore, {
        request,
        user,
        action: 'read_world_state',
        result: 'success',
        resourceType: 'world-state',
        resourceId: result.sessionId,
      });
      response.json(result);
    }),
  );

  app.post(
    '/api/phase6/users',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      let user;

      try {
        user = await gateway.authenticate(authorization);
        const created = await gateway.createUser({
          authorization,
          input: request.body,
        });

        audit(auditStore, {
          request,
          user,
          action: 'create_user',
          result: 'success',
          resourceType: 'user',
          resourceId: String(created.id),
          details: {
            username: created.username,
            role: created.role,
          },
        });
        response.status(201).json(created);
      } catch (error) {
        audit(auditStore, {
          request,
          user,
          action: 'create_user',
          result: 'failure',
          resourceType: 'user',
          details: {
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
    }),
  );

  app.get(
    '/api/phase6/presence',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      await gateway.authenticate(authorization);
      response.json({
        users: presenceStore.list(),
      });
    }),
  );

  app.post(
    '/api/phase6/presence',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      presenceStore.update({
        user,
        position: readPresencePosition(request.body),
      });
      response.json({
        users: presenceStore.list(),
      });
    }),
  );

  app.delete(
    '/api/phase6/presence',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      presenceStore.remove(user.id);
      response.json({
        users: presenceStore.list(),
      });
    }),
  );

  app.get(
    '/api/phase6/chat/world',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.json(
        await gateway.getWorldChat({
          authorization,
          limit: request.query.limit,
        }),
      );
    }),
  );

  app.post(
    '/api/phase6/chat/world',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.status(201).json(
        await gateway.sendWorldChatMessage({
          authorization,
          content: request.body?.content,
        }),
      );
    }),
  );

  app.put(
    '/api/phase6/world-state',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      let user;

      try {
        user = await gateway.authenticate(authorization);
        const result = await gateway.saveWorldState({
          authorization,
          snapshot: request.body?.snapshot,
        });

        audit(auditStore, {
          request,
          user,
          action: 'save_world_state',
          result: 'success',
          resourceType: 'world-state',
          resourceId: result.sessionId,
          details: {
            savedAt: result.savedAt,
          },
        });
        response.json(result);
      } catch (error) {
        audit(auditStore, {
          request,
          user,
          action: 'save_world_state',
          result: 'failure',
          resourceType: 'world-state',
          details: {
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
    }),
  );

  app.get(
    '/api/phase6/documents',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.json(
        await gateway.listDocuments({
          authorization,
          query: request.query,
        }),
      );
    }),
  );

  app.get(
    '/api/phase6/documents/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.json(
        await gateway.getDocument({
          authorization,
          id: request.params.id,
        }),
      );
    }),
  );

  app.post(
    '/api/phase6/documents/upload',
    express.raw({
      type: 'multipart/form-data',
      limit: config.maxUploadBytes + 1024 * 1024,
    }),
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      let user;

      try {
        user = await gateway.authenticate(authorization);
        const parsed = parseMultipart(
          request.body,
          request.get('content-type'),
        );
        const file = parsed.files.find(
          (candidate) => candidate.fieldName === 'file',
        );
        const result = await gateway.uploadDocument({
          file,
          fields: parsed.fields,
          authorization,
        });

        audit(auditStore, {
          request,
          user,
          action: 'upload',
          result: 'success',
          resourceType: 'document',
          resourceId: String(result.document?.id || ''),
          details: {
            sourcePath: result.sourcePath,
            collectionName: result.document?.collectionName || null,
            chunkCount: result.ingest?.chunks || 0,
          },
        });
        response.status(201).json({
          document: result.document,
          ingest: result.ingest,
        });
      } catch (error) {
        audit(auditStore, {
          request,
          user,
          action: 'upload',
          result: 'failure',
          resourceType: 'document',
          details: {
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
    }),
  );

  app.delete(
    '/api/phase6/documents/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      let user;

      try {
        user = await gateway.authenticate(authorization);
        const result = await gateway.deleteDocument({
          authorization,
          id: request.params.id,
        });

        audit(auditStore, {
          request,
          user,
          action: 'delete_document',
          result: 'success',
          resourceType: 'document',
          resourceId: request.params.id,
          details: {
            vectorCleanup: result.vectorCleanup,
          },
        });
        response.json(result);
      } catch (error) {
        audit(auditStore, {
          request,
          user,
          action: 'delete_document',
          result: 'failure',
          resourceType: 'document',
          resourceId: request.params.id,
          details: {
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
    }),
  );

  app.get(
    '/api/phase6/sessions',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.json(
        await gateway.listSessions({
          authorization,
          query: request.query,
        }),
      );
    }),
  );

  app.get(
    '/api/phase6/sessions/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);

      response.json(
        await gateway.getSession({
          authorization,
          id: request.params.id,
        }),
      );
    }),
  );

  app.get(
    '/api/phase6/audit/events',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      response.json({
        events: auditStore.list({
          action: request.query.action,
          ...readPagination(request.query),
        }),
      });
    }),
  );

  app.use((_request, response) => {
    response.status(404).json({
      error: 'NotFound',
      code: 'PHASE6_NOT_FOUND',
      message: 'route not found',
    });
  });

  app.use((error, _request, response, _next) => {
    const isTooLarge = error.type === 'entity.too.large';
    const statusCode = isTooLarge ? 400 : error.statusCode || 500;
    const code = isTooLarge
      ? 'PHASE6_FILE_TOO_LARGE'
      : error.code || 'PHASE6_ERROR';

    response.status(statusCode).json({
      error: error.name || 'Phase6Error',
      code,
      message: statusCode < 500 ? error.message : 'Phase6 request failed',
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
};
