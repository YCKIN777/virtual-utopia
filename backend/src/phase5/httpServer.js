import cors from 'cors';
import express from 'express';
import {
  Phase5Error,
  Phase5ForbiddenError,
  Phase5NotFoundError,
  Phase5UnauthorizedError,
  Phase5ValidationError,
} from './errors.js';
import {
  createAccessToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
} from './security.js';

const asyncHandler = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response, next)).catch(next);

const requireString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Phase5ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

const readPagination = (query) => {
  const limit = Number.parseInt(query.limit, 10);
  const offset = Number.parseInt(query.offset, 10);

  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
};

const readId = (value, field) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Phase5ValidationError(`${field} must be a positive integer`);
  }

  return parsed;
};

const createAuthMiddleware = ({ repositories, config }) => {
  const attachAuth = async (request, _response, next) => {
    try {
      const serviceToken = request.get('x-phase5-service-token');

      if (serviceToken && serviceToken === config.serviceToken) {
        request.auth = {
          role: 'service',
          isService: true,
        };
        next();
        return;
      }

      const authorization = request.get('authorization') || '';

      if (!authorization.startsWith('Bearer ')) {
        throw new Phase5UnauthorizedError();
      }

      const claims = verifyAccessToken({
        token: authorization.slice('Bearer '.length),
        secret: config.authSecret,
      });
      const user = repositories.users.getById(claims.sub);

      if (!user || user.status !== 'active') {
        throw new Phase5UnauthorizedError('user is unavailable');
      }

      request.auth = {
        userId: user.id,
        username: user.username,
        role: user.role,
        isService: false,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

  return (request, response, next) => {
    attachAuth(request, response, next);
  };
};

const requireAuth = (request) => {
  if (!request.auth) {
    throw new Phase5UnauthorizedError();
  }
};

const requireRoles = (request, roles) => {
  requireAuth(request);

  if (!request.auth.isService && !roles.includes(request.auth.role)) {
    throw new Phase5ForbiddenError();
  }
};

const canAccessSession = (request, session) =>
  request.auth.isService ||
  request.auth.role === 'admin' ||
  session.userId === request.auth.userId;

export const createPhase5App = ({ repositories, config, database }) => {
  const app = express();
  const authMiddleware = createAuthMiddleware({
    repositories,
    config,
  });

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_request, response) => {
    const databaseCheck = database.prepare('SELECT 1 AS ok').get();

    response.json({
      service: 'virtual-utopia-phase5',
      status: databaseCheck?.ok === 1 ? 'ok' : 'error',
    });
  });

  app.get('/api/phase5/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-phase5',
      status: 'ok',
      databasePath: config.databasePath,
      sessionStorageMode: config.sessionStorageMode,
    });
  });

  app.post(
    '/api/phase5/auth/login',
    asyncHandler(async (request, response) => {
      const username = requireString(request.body?.username, 'username');
      const password = requireString(request.body?.password, 'password');
      const user = repositories.users.getByUsername(username);
      const passwordMatches =
        user && (await verifyPassword(password, user.passwordHash));

      if (!passwordMatches || user.status !== 'active') {
        throw new Phase5UnauthorizedError('invalid username or password');
      }

      repositories.users.updateLastLogin(user.id);
      const access = createAccessToken({
        user,
        secret: config.authSecret,
        ttlSeconds: config.tokenTtlSeconds,
      });

      response.json({
        token: access.token,
        expiresAt: access.expiresAt,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          displayName: user.displayName,
        },
      });
    }),
  );

  app.get('/api/phase5/auth/me', authMiddleware, (request, response) => {
    requireAuth(request);

    if (request.auth.isService) {
      response.json({
        service: true,
        role: 'service',
      });
      return;
    }

    const user = repositories.users.getById(request.auth.userId);

    response.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    });
  });

  app.post('/api/phase5/auth/logout', authMiddleware, (request, response) => {
    requireAuth(request);
    repositories.logs.create({
      userId: request.auth.userId ?? null,
      operationType: 'logout',
      status: 'success',
    });
    response.json({
      status: 'logged_out',
    });
  });

  app.post(
    '/api/phase5/users',
    authMiddleware,
    asyncHandler(async (request, response) => {
      requireRoles(request, ['admin']);
      const password = requireString(request.body?.password, 'password');
      const role = requireString(request.body?.role, 'role');

      if (!['admin', 'editor', 'viewer'].includes(role)) {
        throw new Phase5ValidationError('role is invalid');
      }

      const user = repositories.users.create({
        username: requireString(request.body?.username, 'username'),
        passwordHash: await hashPassword(password),
        role,
        status: request.body?.status || 'active',
        displayName: request.body?.displayName || null,
      });

      response.status(201).json({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        displayName: user.displayName,
      });
    }),
  );

  app.get('/api/phase5/users', authMiddleware, (request, response) => {
    requireRoles(request, ['admin']);
    const users = repositories.users.list(readPagination(request.query));

    response.json({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        displayName: user.displayName,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    });
  });

  app.put('/api/phase5/users/:id', authMiddleware, (request, response) => {
    requireRoles(request, ['admin']);
    const user = repositories.users.update(readId(request.params.id, 'id'), {
      role: request.body?.role,
      status: request.body?.status,
      displayName: request.body?.displayName,
    });

    response.json({
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
    });
  });

  app.post('/api/phase5/sessions', authMiddleware, (request, response) => {
    requireRoles(request, ['admin', 'editor']);
    const requestedUserId = request.body?.userId ?? request.auth.userId ?? null;

    if (
      !request.auth.isService &&
      request.auth.role !== 'admin' &&
      requestedUserId !== request.auth.userId
    ) {
      throw new Phase5ForbiddenError();
    }

    const session = repositories.sessions.create({
      id: requireString(request.body?.id, 'id'),
      userId: requestedUserId,
      sceneId: requireString(request.body?.sceneId, 'sceneId'),
      sessionType: requireString(request.body?.sessionType, 'sessionType'),
      ownerAgentId: requireString(request.body?.ownerAgentId, 'ownerAgentId'),
      title: request.body?.title || null,
      messages: request.body?.messages || [],
      expiresAt: requireString(request.body?.expiresAt, 'expiresAt'),
    });

    response.status(201).json(session);
  });

  app.get('/api/phase5/sessions', authMiddleware, (request, response) => {
    requireAuth(request);
    const pagination = readPagination(request.query);
    const allUsers =
      request.query.all === 'true' &&
      (request.auth.isService || request.auth.role === 'admin');
    const sessions = repositories.sessions.list({
      userId: request.auth.userId,
      allUsers,
      ...pagination,
    });

    response.json({
      sessions,
    });
  });

  app.get('/api/phase5/sessions/:id', authMiddleware, (request, response) => {
    requireAuth(request);
    const session = repositories.sessions.getById(request.params.id);

    if (!session || session.status === 'deleted') {
      throw new Phase5NotFoundError('session not found');
    }

    if (!canAccessSession(request, session)) {
      throw new Phase5ForbiddenError();
    }

    response.json(session);
  });

  app.put('/api/phase5/sessions/:id', authMiddleware, (request, response) => {
    requireAuth(request);
    const current = repositories.sessions.getById(request.params.id);

    if (!current || current.status === 'deleted') {
      throw new Phase5NotFoundError('session not found');
    }

    if (!canAccessSession(request, current)) {
      throw new Phase5ForbiddenError();
    }

    const session = repositories.sessions.update(request.params.id, {
      title: request.body?.title,
      messages: request.body?.messages,
      status: request.body?.status,
      expiresAt: request.body?.expiresAt,
    });

    response.json(session);
  });

  app.delete(
    '/api/phase5/sessions/:id',
    authMiddleware,
    (request, response) => {
      requireAuth(request);
      const current = repositories.sessions.getById(request.params.id);

      if (!current || current.status === 'deleted') {
        throw new Phase5NotFoundError('session not found');
      }

      if (!canAccessSession(request, current)) {
        throw new Phase5ForbiddenError();
      }

      response.json(repositories.sessions.delete(request.params.id));
    },
  );

  app.post('/api/phase5/documents', authMiddleware, (request, response) => {
    requireRoles(request, ['admin', 'editor']);
    const document = repositories.documents.create({
      documentKey: requireString(request.body?.documentKey, 'documentKey'),
      title: requireString(request.body?.title, 'title'),
      sourcePath: requireString(request.body?.sourcePath, 'sourcePath'),
      fileName: requireString(request.body?.fileName, 'fileName'),
      mimeType: request.body?.mimeType || null,
      contentHash: requireString(request.body?.contentHash, 'contentHash'),
      chunkCount: request.body?.chunkCount ?? 0,
      collectionName: requireString(
        request.body?.collectionName,
        'collectionName',
      ),
      status: request.body?.status || 'pending',
      metadata: request.body?.metadata || {},
      createdBy: request.auth.isService ? null : request.auth.userId,
    });

    response.status(201).json(document);
  });

  app.get('/api/phase5/documents', authMiddleware, (request, response) => {
    requireAuth(request);
    const documents = repositories.documents.list({
      status: request.query.status,
      collectionName: request.query.collectionName,
      ...readPagination(request.query),
    });

    response.json({
      documents,
    });
  });

  app.get('/api/phase5/documents/:id', authMiddleware, (request, response) => {
    requireAuth(request);
    const document = repositories.documents.getById(
      readId(request.params.id, 'id'),
    );

    if (!document || document.status === 'deleted') {
      throw new Phase5NotFoundError('document not found');
    }

    response.json(document);
  });

  app.put('/api/phase5/documents/:id', authMiddleware, (request, response) => {
    requireRoles(request, ['admin', 'editor']);
    const document = repositories.documents.update(
      readId(request.params.id, 'id'),
      {
        title: request.body?.title,
        sourcePath: request.body?.sourcePath,
        fileName: request.body?.fileName,
        mimeType: request.body?.mimeType,
        contentHash: request.body?.contentHash,
        chunkCount: request.body?.chunkCount,
        collectionName: request.body?.collectionName,
        status: request.body?.status,
        metadata: request.body?.metadata,
      },
    );

    response.json(document);
  });

  app.delete(
    '/api/phase5/documents/:id',
    authMiddleware,
    (request, response) => {
      requireRoles(request, ['admin']);
      response.json(
        repositories.documents.delete(readId(request.params.id, 'id')),
      );
    },
  );

  app.post('/api/phase5/logs', authMiddleware, (request, response) => {
    requireAuth(request);
    const log = repositories.logs.create({
      userId: request.auth.isService
        ? (request.body?.userId ?? null)
        : request.auth.userId,
      sessionId: request.body?.sessionId || null,
      operationType: requireString(
        request.body?.operationType,
        'operationType',
      ),
      queryText: request.body?.queryText || null,
      collectionName: request.body?.collectionName || null,
      topK: request.body?.topK ?? null,
      similarityThreshold: request.body?.similarityThreshold ?? null,
      matchedCount: request.body?.matchedCount ?? 0,
      matchedChunks: request.body?.matchedChunks || [],
      latencyMs: request.body?.latencyMs ?? null,
      status: requireString(request.body?.status, 'status'),
      errorCode: request.body?.errorCode || null,
    });

    response.status(201).json(log);
  });

  app.get('/api/phase5/logs', authMiddleware, (request, response) => {
    requireAuth(request);
    const requestedUserId = request.query.userId
      ? readId(request.query.userId, 'userId')
      : undefined;
    const canReadAll = request.auth.isService || request.auth.role === 'admin';
    const logs = repositories.logs.list({
      userId: canReadAll ? requestedUserId : request.auth.userId,
      sessionId: request.query.sessionId,
      status: request.query.status,
      from: request.query.from,
      to: request.query.to,
      ...readPagination(request.query),
    });

    response.json({
      logs,
    });
  });

  app.get('/api/phase5/logs/:id', authMiddleware, (request, response) => {
    requireAuth(request);
    const log = repositories.logs.getById(readId(request.params.id, 'id'));

    if (!log) {
      throw new Phase5NotFoundError('log not found');
    }

    if (
      !request.auth.isService &&
      request.auth.role !== 'admin' &&
      log.userId !== request.auth.userId
    ) {
      throw new Phase5ForbiddenError();
    }

    response.json(log);
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: 'NotFound',
      code: 'PHASE5_NOT_FOUND',
      message: 'route not found',
    });
  });

  app.use((error, _request, response, _next) => {
    const constraintError =
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error.code === 'ERR_SQLITE_ERROR';
    const statusCode = error.statusCode || (constraintError ? 409 : 500);
    const code =
      error.code ||
      (constraintError ? 'PHASE5_CONSTRAINT_ERROR' : 'PHASE5_ERROR');

    response.status(statusCode).json({
      error: error.name || 'Phase5Error',
      code,
      message: statusCode < 500 ? error.message : 'Phase5 request failed',
    });
  });

  return app;
};

export const startPhase5HttpServer = async ({ app, port }) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, 'localhost');

    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });

export { Phase5Error };
