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

  // 根路径友好入口（仅新增只读页面，不改变任何既有接口行为）
  app.get('/', (_request, response) => {
    response.type('text/html').send(
      [
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
        '<title>虚拟乌托邦 · 鉴权服务</title>',
        '<style>body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
        'max-width:720px;margin:48px auto;padding:0 20px;color:#1d1d1f;line-height:1.7}',
        'h1{font-size:20px;margin:0 0 4px}small{color:#6e6e73}',
        'h2{font-size:14px;margin:24px 0 8px;color:#258a41}',
        'a{color:#258a41;text-decoration:none;border-bottom:1px solid rgba(47,168,79,.35)}',
        'code{background:#f5f5f7;padding:2px 6px;border-radius:6px;font-size:12.5px}',
        'li{margin:6px 0;font-size:13.5px}</style></head><body>',
        '<h1>虚拟乌托邦 · 鉴权服务（phase5）</h1>',
        '<small>本服务只提供 JSON API，没有网页界面。</small>',
        '<h2>入口</h2>',
        '<ul>',
        '<li><a href="http://localhost:5199/">http://localhost:5199/</a> — 前端主世界（登录入口）</li>',
        '<li><a href="/health">/health</a> · <a href="/api/phase5/health">/api/phase5/health</a> — 健康检查</li>',
        '</ul>',
        '<h2>主要接口</h2>',
        '<ul>',
        '<li><code>POST /api/phase5/auth/login</code> — 登录（密码需为 sha256 十六进制；网页登录框会自动处理）</li>',
        '<li><code>GET /api/phase5/auth/me</code> · <code>POST /api/phase5/auth/logout</code></li>',
        '<li><code>PUT /api/phase5/auth/password</code> — 修改密码</li>',
        '</ul>',
        '</body></html>',
      ].join(''),
    );
  });

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

  app.post(
    '/api/phase5/auth/register',
    asyncHandler(async (request, response) => {
      const username = requireString(request.body?.username, 'username');
      const password = requireString(request.body?.password, 'password');
      const displayName = requireString(request.body?.displayName, 'displayName');

      if (username.length < 3) {
        throw new Phase5ValidationError('username must be at least 3 characters');
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new Phase5ValidationError('username can only contain letters, digits and underscore');
      }

      if (displayName.length < 2 || displayName.length > 24) {
        throw new Phase5ValidationError('displayName must be between 2 and 24 characters');
      }

      if (password.length < 6) {
        throw new Phase5ValidationError('password must be at least 6 characters');
      }

      const existing = repositories.users.getByUsername(username);

      if (existing && existing.status !== 'disabled') {
        throw new Phase5ValidationError('用户名已被占用');
      }

      const nameTaken = repositories.users.getByDisplayName(displayName);

      if (nameTaken && nameTaken.status !== 'disabled' && nameTaken.id !== existing?.id) {
        throw new Phase5ValidationError('昵称已被占用');
      }

      const passwordHash = await hashPassword(password);
      const profile = {
        hobbies: request.body?.hobbies?.trim() || null,
        occupation: request.body?.occupation?.trim() || null,
        selfIntro: request.body?.selfIntro?.trim() || null,
        contact: request.body?.contact?.trim() || null,
        address: request.body?.address?.trim() || null,
      };

      const user = existing
        ? repositories.users.updatePassword(existing.id, passwordHash)
        : repositories.users.create({
            username,
            passwordHash,
            role: 'editor',
            status: 'pending',
            displayName,
            ...profile,
          });

      if (existing) {
        repositories.users.update(existing.id, {
          status: 'pending',
          displayName,
          ...profile,
        });
      }

      response.status(201).json({
        id: user.id,
        username: user.username,
        displayName,
        role: user.role,
        status: 'pending',
      });
    }),
  );

  // 公开查询入驻申请状态（访客登录弹窗「查询我的申请」使用，无需登录）
  app.get('/api/phase5/resident-applications/query', (request, response) => {
    const username = String(request.query.username || '').trim();

    if (!username) {
      throw new Phase5ValidationError('username is required');
    }

    const user = repositories.users.getByUsername(username);

    if (!user) {
      response.json({
        found: false,
        username,
        status: null,
        rejectReason: null,
      });
      return;
    }

    response.json({
      found: true,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      rejectReason: user.rejectReason || null,
    });
  });

  app.put(
    '/api/phase5/auth/password',
    authMiddleware,
    asyncHandler(async (request, response) => {
      requireAuth(request);

      if (request.auth.isService) {
        throw new Phase5ForbiddenError();
      }

      const currentPassword = requireString(
        request.body?.currentPassword,
        'currentPassword',
      );
      const newPassword = requireString(request.body?.newPassword, 'newPassword');

      if (newPassword.length < 6) {
        throw new Phase5ValidationError('password must be at least 6 characters');
      }

      const user = repositories.users.getById(request.auth.userId);
      const passwordMatches = await verifyPassword(
        currentPassword,
        user.passwordHash,
      );

      if (!passwordMatches) {
        throw new Phase5UnauthorizedError('current password is incorrect');
      }

      repositories.users.updatePassword(user.id, await hashPassword(newPassword));

      response.json({ status: 'updated' });
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
    const users = repositories.users.list({
      ...readPagination(request.query),
      status: request.query.status || undefined,
    });

    response.json({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        displayName: user.displayName,
        hobbies: user.hobbies,
        occupation: user.occupation,
        selfIntro: user.selfIntro,
        contact: user.contact,
        address: user.address,
        rejectReason: user.rejectReason,
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
      hobbies: request.body?.hobbies,
      occupation: request.body?.occupation,
      selfIntro: request.body?.selfIntro,
      contact: request.body?.contact,
      address: request.body?.address,
      rejectReason: request.body?.rejectReason,
    });

    response.json({
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      hobbies: user.hobbies,
      occupation: user.occupation,
      selfIntro: user.selfIntro,
      contact: user.contact,
      address: user.address,
      rejectReason: user.rejectReason,
    });
  });

  app.put(
    '/api/phase5/users/:id/password',
    authMiddleware,
    asyncHandler(async (request, response) => {
      requireRoles(request, ['admin']);
      const newPassword = requireString(request.body?.password, 'password');

      if (newPassword.length < 6) {
        throw new Phase5ValidationError('password must be at least 6 characters');
      }

      const target = repositories.users.getById(readId(request.params.id, 'id'));

      if (!target) {
        throw new Phase5NotFoundError('user not found');
      }

      if (target.role === 'admin') {
        throw new Phase5ForbiddenError('不能重置城主账号密码');
      }

      const user = repositories.users.updatePassword(
        target.id,
        await hashPassword(newPassword),
      );

      response.json({
        id: user.id,
        username: user.username,
        status: 'updated',
      });
    }),
  );

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
