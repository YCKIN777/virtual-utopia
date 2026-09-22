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
import { createFriendStore } from './friendStore.js';
import { createGuestbookStore } from './guestbookStore.js';
import { createPresenceStore } from './presenceStore.js';
import { createPlotAssignmentStore } from './plotAssignmentStore.js';
import { createResidentCardStore } from './residentCardStore.js';
import { createResidentChatService } from './residentChatService.js';
import {
  createResidentSocialStore,
  GROUP_MAX_MEMBERS,
} from './residentSocialStore.js';
import { createUploadService } from './uploadService.js';
import { createVisitorQuotaStore } from './visitorQuotaStore.js';
import { createPhase7 } from '../phase7/index.js';

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
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
  optionsSuccessStatus: 204,
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
    appearance: body?.appearance || null,
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
    appearance: values.appearance,
  };
};

export const createPhase6App = ({
  config,
  auditStore = createAuditStore(config.auditDatabasePath),
  visitorQuotaStore = createVisitorQuotaStore({
    databasePath: config.quotaDatabasePath,
  }),
  plotAssignmentStore = createPlotAssignmentStore({
    databasePath: config.plotDatabasePath,
  }),
  residentCardStore = createResidentCardStore({
    databasePath: config.cardDatabasePath,
  }),
  guestbookStore = createGuestbookStore({
    databasePath: config.guestbookDatabasePath,
  }),
  residentSocialStore = createResidentSocialStore({
    databasePath: config.socialDatabasePath,
  }),
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
  const residentChatService = createResidentChatService();
  const presenceStore = createPresenceStore();
  const friendStore = createFriendStore();
  const app = express();
  app.locals.presenceStore = presenceStore;
  app.locals.friendStore = friendStore;
  app.locals.visitorQuotaStore = visitorQuotaStore;
  app.locals.plotAssignmentStore = plotAssignmentStore;
  app.locals.residentCardStore = residentCardStore;
  app.locals.guestbookStore = guestbookStore;
  app.locals.residentSocialStore = residentSocialStore;

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

  app.post(
    '/api/phase6/chat/resident',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      let user;

      try {
        user = await gateway.authenticate(authorization);
        const result = await residentChatService.chat({
          residentName: request.body?.residentName,
          message: request.body?.message,
          history: request.body?.history,
        });

        audit(auditStore, {
          request,
          user,
          action: 'resident_chat',
          result: 'success',
          resourceType: 'resident-chat',
          details: {
            residentName: request.body?.residentName,
            mock: result.mock,
          },
        });
        response.json(result);
      } catch (error) {
        audit(auditStore, {
          request,
          user,
          action: 'resident_chat',
          result: 'failure',
          resourceType: 'resident-chat',
          details: {
            code: error.code || 'PHASE6_ERROR',
          },
        });
        throw error;
      }
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

  // ===== 好友系统 =====
  app.post(
    '/api/phase6/friends/request',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const toUserId = Number(request.body?.toUserId);

      if (!Number.isFinite(toUserId)) {
        throw new Phase6ValidationError('toUserId is required');
      }

      const to = {
        id: toUserId,
        username: String(request.body?.toUsername || ''),
        displayName: String(
          request.body?.toDisplayName || request.body?.toUsername || '',
        ),
      };

      const created = friendStore.sendRequest({ from: user, to });
      if (!created) {
        throw new Phase6ValidationError(
          'friend request already exists or invalid',
        );
      }

      response.json({
        friends: friendStore.listFriends(user),
        requests: friendStore.listRequests(user),
      });
    }),
  );

  app.post(
    '/api/phase6/friends/respond',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const requestId = String(request.body?.requestId || '');
      const accept = Boolean(request.body?.accept);

      if (!requestId) {
        throw new Phase6ValidationError('requestId is required');
      }

      const result = friendStore.respond({ requestId, user, accept });
      if (!result) {
        throw new Phase6ValidationError(
          'friend request not found or not for this user',
        );
      }

      response.json({
        friends: friendStore.listFriends(user),
        requests: friendStore.listRequests(user),
      });
    }),
  );

  app.get(
    '/api/phase6/friends',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      response.json({
        friends: friendStore.listFriends(user),
        requests: friendStore.listRequests(user),
      });
    }),
  );

  app.delete(
    '/api/phase6/friends/:friendId',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const friendId = Number(request.params.friendId);

      if (!Number.isFinite(friendId)) {
        throw new Phase6ValidationError('friendId is required');
      }

      const removed = friendStore.removeFriend({ user, friendId });
      response.json({
        removed,
        friends: friendStore.listFriends(user),
        requests: friendStore.listRequests(user),
      });
    }),
  );

  // ===== 访客名额权限模块 =====
  const runQuotaOperation = (operation) => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof Phase6Error) {
        throw error;
      }

      throw new Phase6ValidationError(error.message, {
        code: error.code || 'PHASE6_VALIDATION_ERROR',
      });
    }
  };

  app.post(
    '/api/phase6/residents',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const resident = runQuotaOperation(() =>
        visitorQuotaStore.onboardResident({
          userId: Number(request.body?.userId),
          username: String(request.body?.username || ''),
          displayName: request.body?.displayName || null,
          homePlotId: request.body?.homePlotId || null,
        }),
      );

      audit(auditStore, {
        request,
        user,
        action: 'onboard_resident',
        result: 'success',
        resourceType: 'resident',
        resourceId: String(resident.userId),
      });
      response.status(201).json({ resident });
    }),
  );

  app.get(
    '/api/phase6/residents',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      response.json({
        residents: visitorQuotaStore.listResidents(),
      });
    }),
  );

  app.post(
    '/api/phase6/residents/:userId/depart',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const residentUserId = Number(request.params.userId);
      const result = runQuotaOperation(() =>
        visitorQuotaStore.departResident(residentUserId),
      );

      if (!result) {
        throw new Phase6ValidationError('resident not found or already departed');
      }

      const assignedPlot = plotAssignmentStore
        .list()
        .find(
          (plot) =>
            plot.status === 'assigned' &&
            plot.residentUserId === residentUserId,
        );

      if (assignedPlot) {
        plotAssignmentStore.revokePlot(assignedPlot.plotNumber);
      }

      await gateway.setUserStatus({
        authorization,
        userId: residentUserId,
        status: 'moved_out',
      });

      audit(auditStore, {
        request,
        user,
        action: 'depart_resident',
        result: 'success',
        resourceType: 'resident',
        resourceId: request.params.userId,
        details: {
          revokedInvitations: result.revokedInvitations,
          revokedPlot: assignedPlot?.plotNumber ?? null,
        },
      });
      response.json(result);
    }),
  );

  // ===== 居民自助注册 + 入驻申请审核 =====
  app.post(
    '/api/phase6/residents/apply',
    asyncHandler(async (request, response) => {
      const result = await gateway.registerResidentApplication({
        username: request.body?.username,
        password: request.body?.password,
        displayName: request.body?.displayName,
        hobbies: request.body?.hobbies,
        occupation: request.body?.occupation,
        selfIntro: request.body?.selfIntro,
        contact: request.body?.contact,
        address: request.body?.address,
      });

      audit(auditStore, {
        request,
        action: 'resident_apply',
        result: 'success',
        resourceType: 'resident-application',
        resourceId: String(result.id),
        details: {
          username: result.username,
        },
      });
      response.status(201).json(result);
    }),
  );

  app.get(
    '/api/phase6/resident-applications',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      response.json(
        await gateway.listPendingApplications({ authorization }),
      );
    }),
  );

  app.post(
    '/api/phase6/resident-applications/:userId/approve',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const residentUserId = Number(request.params.userId);

      if (!Number.isFinite(residentUserId) || residentUserId <= 0) {
        throw new Phase6ValidationError('userId must be a positive integer');
      }

      const quotaStats = visitorQuotaStore.getStats();

      if (quotaStats.activeResidentCount >= quotaStats.residentLimit) {
        throw new Phase6ValidationError('原住民已达 50 人上限，无法批准新申请', {
          code: 'RESIDENT_LIMIT_REACHED',
        });
      }

      const vacantPlot = plotAssignmentStore
        .list()
        .find((plot) => plot.status === 'vacant');

      if (!vacantPlot) {
        throw new Phase6ValidationError('暂无空置宅院可供分配');
      }

      const approvedUser = await gateway.setUserStatus({
        authorization,
        userId: residentUserId,
        status: 'active',
      });

      const username = String(
        request.body?.username || approvedUser?.username || '',
      );
      const displayName = approvedUser?.displayName || request.body?.displayName || null;
      const homePlotId = `plot-${vacantPlot.plotNumber}`;

      const resident = runQuotaOperation(() =>
        visitorQuotaStore.onboardResident({
          userId: residentUserId,
          username,
          displayName,
          homePlotId,
          hobbies: approvedUser?.hobbies || null,
          occupation: approvedUser?.occupation || null,
          selfIntro: approvedUser?.selfIntro || null,
        }),
      );

      const plot = plotAssignmentStore.assignPlot({
        plotNumber: vacantPlot.plotNumber,
        residentUserId,
        residentUsername: resident.username,
        residentDisplayName: resident.displayName,
      });

      audit(auditStore, {
        request,
        user,
        action: 'approve_resident_application',
        result: 'success',
        resourceType: 'resident-application',
        resourceId: String(residentUserId),
        details: {
          username,
          homePlotId,
          plotNumber: plot.plotNumber,
        },
      });
      response.status(201).json({
        resident,
        plot,
      });
    }),
  );

  app.post(
    '/api/phase6/resident-applications/:userId/reject',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const residentUserId = Number(request.params.userId);

      if (!Number.isFinite(residentUserId) || residentUserId <= 0) {
        throw new Phase6ValidationError('userId must be a positive integer');
      }

      const rejected = await gateway.rejectApplication({
        authorization,
        userId: residentUserId,
        reason: request.body?.reason,
      });

      audit(auditStore, {
        request,
        user,
        action: 'reject_resident_application',
        result: 'success',
        resourceType: 'resident-application',
        resourceId: String(residentUserId),
        details: {
          username: rejected?.username,
          reason: String(request.body?.reason || '').trim() || null,
        },
      });
      response.json(rejected);
    }),
  );

  app.get(
    '/api/phase6/resident-applications/query',
    asyncHandler(async (request, response) => {
      response.json(
        await gateway.queryResidentApplication({
          username: request.query.username,
        }),
      );
    }),
  );

  app.put(
    '/api/phase6/auth/password',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const result = await gateway.changePassword({
        authorization,
        currentPassword: request.body?.currentPassword,
        newPassword: request.body?.newPassword,
      });

      audit(auditStore, {
        request,
        user,
        action: 'change_password',
        result: 'success',
        resourceType: 'user',
        resourceId: String(user.id),
      });
      response.json(result);
    }),
  );

  app.post(
    '/api/phase6/residents/:userId/reset-password',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const result = await gateway.resetPassword({
        authorization,
        userId: Number(request.params.userId),
        newPassword: request.body?.password,
      });

      audit(auditStore, {
        request,
        user,
        action: 'reset_resident_password',
        result: 'success',
        resourceType: 'user',
        resourceId: request.params.userId,
      });
      response.json(result);
    }),
  );

  app.get(
    '/api/phase6/visitor-quotas/overview',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      response.json(visitorQuotaStore.getOverview({ userId: user.id, role: user.role }));
    }),
  );

  app.get(
    '/api/phase6/visitor-quotas/stats',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      response.json({
        stats: visitorQuotaStore.getStats(),
        residents: visitorQuotaStore.listResidents(),
        invitations: visitorQuotaStore.listInvitations(),
      });
    }),
  );

  app.post(
    '/api/phase6/visitor-quotas/issue',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      const invitation = runQuotaOperation(() =>
        visitorQuotaStore.issueResidentInvitation({ userId: user.id }),
      );

      response.status(201).json({
        invitation,
        overview: visitorQuotaStore.getOverview({ userId: user.id, role: user.role }),
      });
    }),
  );

  app.post(
    '/api/phase6/visitor-quotas/admin-issue',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const invitation = runQuotaOperation(() =>
        visitorQuotaStore.issueAdminInvitation(),
      );

      audit(auditStore, {
        request,
        user,
        action: 'issue_admin_visitor_quota',
        result: 'success',
        resourceType: 'visitor-invitation',
        resourceId: invitation.id,
      });
      response.status(201).json({
        invitation,
        stats: visitorQuotaStore.getStats(),
      });
    }),
  );

  app.post(
    '/api/phase6/visitor-quotas/:invitationId/revoke',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      const invitation = runQuotaOperation(() =>
        visitorQuotaStore.revokeResidentInvitation({
          userId: user.id,
          invitationId: request.params.invitationId,
        }),
      );

      if (!invitation) {
        throw new Phase6ValidationError('invitation not found or not yours');
      }

      response.json({
        invitation,
        overview: visitorQuotaStore.getOverview({ userId: user.id, role: user.role }),
      });
    }),
  );

  app.post(
    '/api/phase6/visitor-quotas/register',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      const code = String(request.body?.code || '').trim();

      if (!code) {
        throw new Phase6ValidationError('code is required');
      }

      const invitation = runQuotaOperation(() =>
        visitorQuotaStore.registerVisitor({ code, user }),
      );

      response.status(201).json({
        invitation,
        stats: visitorQuotaStore.getStats(),
      });
    }),
  );

  app.delete(
    '/api/phase6/visitors/:userId',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const invitation = visitorQuotaStore.removeVisitor({
        userId: Number(request.params.userId),
      });

      if (!invitation) {
        throw new Phase6ValidationError('visitor not found');
      }

      audit(auditStore, {
        request,
        user,
        action: 'remove_visitor',
        result: 'success',
        resourceType: 'visitor',
        resourceId: request.params.userId,
        details: {
          invitationId: invitation.id,
          channel: invitation.channel,
        },
      });
      response.json({
        invitation,
        stats: visitorQuotaStore.getStats(),
      });
    }),
  );

  // ===== 宅院绑定分配（城主后台） =====
  app.get(
    '/api/phase6/plots',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      response.json({
        plots: plotAssignmentStore.list(),
        stats: plotAssignmentStore.getStats(),
      });
    }),
  );

  app.post(
    '/api/phase6/plots',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const plotNumber = Number(request.body?.plotNumber);
      const residentUserId = Number(request.body?.residentUserId);

      if (!Number.isFinite(plotNumber) || !Number.isFinite(residentUserId)) {
        throw new Phase6ValidationError('plotNumber 与 residentUserId 必填');
      }

      const plot = runQuotaOperation(() =>
        plotAssignmentStore.assignPlot({
          plotNumber,
          residentUserId,
          residentUsername: String(request.body?.residentUsername || ''),
          residentDisplayName: request.body?.residentDisplayName || null,
          customName: request.body?.customName || null,
        }),
      );

      audit(auditStore, {
        request,
        user,
        action: 'assign_plot',
        result: 'success',
        resourceType: 'plot',
        resourceId: String(plot.plotNumber),
        details: {
          residentUserId: plot.residentUserId,
          customName: plot.customName,
        },
      });
      response.status(201).json({ plot });
    }),
  );

  app.delete(
    '/api/phase6/plots/:plotNumber',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const plot = plotAssignmentStore.revokePlot(
        Number(request.params.plotNumber),
      );

      if (!plot) {
        throw new Phase6ValidationError('plot not found');
      }

      audit(auditStore, {
        request,
        user,
        action: 'revoke_plot',
        result: 'success',
        resourceType: 'plot',
        resourceId: request.params.plotNumber,
      });
      response.json({ plot });
    }),
  );

  app.put(
    '/api/phase6/plots/:plotNumber',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);

      if (user.role !== 'admin') {
        throw new Phase6ForbiddenError();
      }

      const plot = plotAssignmentStore.renamePlot(
        Number(request.params.plotNumber),
        request.body?.customName || null,
      );

      if (!plot) {
        throw new Phase6ValidationError('plot not found');
      }

      response.json({ plot });
    }),
  );

  // ===== 居民主页卡片（居民主页迭代 S1） =====
  const RESIDENT_CARD_TYPES = new Set([
    'work_plan',
    'travel_log',
    'life_note',
    'wish_list',
    'favorite',
  ]);

  const requireResident = (user) => {
    if (!['admin', 'editor'].includes(user.role)) {
      throw new Phase6ForbiddenError('游客不可见居民主页卡片');
    }
  };

  const normalizeCardContent = (raw) => {
    if (raw === undefined || raw === null) {
      throw new Phase6ValidationError('content is required');
    }

    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new Phase6ValidationError('content must be valid JSON');
      }
    }

    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Phase6ValidationError('content must be an object');
    }

    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
    const body = typeof raw.body === 'string' ? raw.body.trim().slice(0, 2000) : '';

    if (!title && !body) {
      throw new Phase6ValidationError('content title or body is required');
    }

    return {
      title,
      body,
      ...(typeof raw.inviteOpen === 'boolean' ? { inviteOpen: raw.inviteOpen } : {}),
      ...(typeof raw.refType === 'string' ? { refType: raw.refType.trim().slice(0, 40) } : {}),
    };
  };

  const normalizeCardPermission = (cardType, raw) =>
    cardType === 'favorite'
      ? 'self'
      : raw === 'residents'
        ? 'residents'
        : 'self';

  app.get(
    '/api/phase6/resident-cards',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      response.json({
        mine: residentCardStore.listByUser(user.id),
        community: residentCardStore.listCommunity(user.id),
      });
    }),
  );

  app.post(
    '/api/phase6/resident-cards',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const cardType = String(request.body?.cardType || '');

      if (!RESIDENT_CARD_TYPES.has(cardType)) {
        throw new Phase6ValidationError('cardType is invalid');
      }

      const card = residentCardStore.create({
        userId: user.id,
        username: user.username,
        cardType,
        content: normalizeCardContent(request.body?.content),
        permission: normalizeCardPermission(
          cardType,
          request.body?.permission,
        ),
      });

      audit(auditStore, {
        request,
        user,
        action: 'create_resident_card',
        result: 'success',
        resourceType: 'resident-card',
        resourceId: card.id,
        details: { cardType },
      });
      response.status(201).json({ card });
    }),
  );

  app.put(
    '/api/phase6/resident-cards/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const existing = residentCardStore.getById(request.params.id);

      if (!existing) {
        throw new Phase6NotFoundError('resident card not found');
      }

      if (existing.userId !== user.id) {
        throw new Phase6ForbiddenError('只能编辑自己的卡片');
      }

      const card = residentCardStore.update(request.params.id, {
        content: normalizeCardContent(request.body?.content),
        permission: normalizeCardPermission(
          existing.cardType,
          request.body?.permission,
        ),
      });

      response.json({ card });
    }),
  );

  app.delete(
    '/api/phase6/resident-cards/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const existing = residentCardStore.getById(request.params.id);

      if (!existing) {
        throw new Phase6NotFoundError('resident card not found');
      }

      if (existing.userId !== user.id) {
        throw new Phase6ForbiddenError('只能删除自己的卡片');
      }

      residentCardStore.remove(request.params.id);

      response.json({ id: request.params.id });
    }),
  );

  // ===== 居民主页迭代 S2：个人展示板 + 邻里留言簿 =====
  const readBoardUserId = (request, selfUserId) => {
    const raw = request.query.userId;

    if (raw === undefined || raw === null || raw === '') {
      return selfUserId;
    }

    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Phase6ValidationError('userId must be a positive integer');
    }

    return parsed;
  };

  app.get(
    '/api/phase6/resident-board',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const targetUserId = readBoardUserId(request, user.id);

      response.json({
        board: residentCardStore.listPublicByUser(targetUserId),
        ownerUserId: targetUserId,
      });
    }),
  );

  app.get(
    '/api/phase6/guestbook',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const limit = Number.parseInt(request.query.limit, 10) || 100;

      response.json({
        messages: guestbookStore.list(Math.max(1, Math.min(limit, 200))),
      });
    }),
  );

  app.post(
    '/api/phase6/guestbook',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const content = String(request.body?.content || '').trim();

      if (!content || content.length > 300) {
        throw new Phase6ValidationError(
          'guestbook content must be between 1 and 300 characters',
        );
      }

      const message = guestbookStore.create({
        fromUserId: user.id,
        fromUsername: user.username,
        content,
      });

      audit(auditStore, {
        request,
        user,
        action: 'create_guestbook_message',
        result: 'success',
        resourceType: 'guestbook',
        resourceId: message.id,
      });
      response.status(201).json({ message });
    }),
  );

  app.delete(
    '/api/phase6/guestbook/:id',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const existing = guestbookStore.getById(request.params.id);

      if (!existing) {
        throw new Phase6NotFoundError('guestbook message not found');
      }

      if (existing.fromUserId !== user.id && user.role !== 'admin') {
        throw new Phase6ForbiddenError('只能删除自己的留言');
      }

      guestbookStore.remove(request.params.id);

      response.json({ id: request.params.id });
    }),
  );

  // ===== 居民主页迭代 S3：原住民名录 + 一对一私聊 + 临时小群 =====
  const listActiveResidents = () =>
    visitorQuotaStore
      .listResidents()
      .filter((resident) => resident.status === 'active')
      .map((resident) => ({
        userId: resident.userId,
        username: resident.username,
        displayName: resident.displayName || resident.username,
        homePlotId: resident.homePlotId,
        hobbies: resident.hobbies || null,
        occupation: resident.occupation || null,
        selfIntro: resident.selfIntro || null,
      }));

  const findActiveResident = (userId) =>
    listActiveResidents().find((resident) => resident.userId === userId);

  app.get(
    '/api/phase6/resident-directory',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      response.json({
        residents: listActiveResidents(),
      });
    }),
  );

  app.get(
    '/api/phase6/direct-messages',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const peerId = Number.parseInt(request.query.peerId, 10);

      if (!Number.isFinite(peerId) || peerId <= 0) {
        throw new Phase6ValidationError('peerId must be a positive integer');
      }

      if (peerId === user.id) {
        throw new Phase6ValidationError('不能与自己私聊');
      }

      response.json({
        messages: residentSocialStore.listDirectMessages(user.id, peerId),
      });
    }),
  );

  app.post(
    '/api/phase6/direct-messages',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const toUserId = Number(request.body?.toUserId);
      const content = String(request.body?.content || '').trim();

      if (!Number.isFinite(toUserId) || toUserId <= 0) {
        throw new Phase6ValidationError('toUserId must be a positive integer');
      }

      if (toUserId === user.id) {
        throw new Phase6ValidationError('不能与自己私聊');
      }

      if (!content || content.length > 300) {
        throw new Phase6ValidationError(
          'content must be between 1 and 300 characters',
        );
      }

      const message = residentSocialStore.createDirectMessage({
        fromUserId: user.id,
        toUserId,
        content,
      });

      response.status(201).json({ message });
    }),
  );

  app.get(
    '/api/phase6/groups',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const groups = residentSocialStore
        .listGroupsByUser(user.id)
        .map((group) => ({
          ...group,
          members: residentSocialStore.listMembers(group.id),
        }));

      response.json({ groups });
    }),
  );

  app.post(
    '/api/phase6/groups',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const name = String(request.body?.name || '').trim();
      const memberIds = Array.isArray(request.body?.memberIds)
        ? request.body.memberIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];

      if (!name || name.length > 40) {
        throw new Phase6ValidationError('群名称必填且不超过 40 字符');
      }

      if (memberIds.length + 1 > GROUP_MAX_MEMBERS) {
        throw new Phase6ValidationError(
          `临时小群最多 ${GROUP_MAX_MEMBERS} 人（含创建者）`,
        );
      }

      const invited = [];

      for (const memberId of memberIds) {
        const resident = findActiveResident(memberId);

        if (!resident) {
          throw new Phase6ValidationError('只能邀请名录中的原住民');
        }

        invited.push({
          userId: resident.userId,
          username: resident.username,
        });
      }

      const group = residentSocialStore.createGroup({
        name,
        creatorUserId: user.id,
        creatorUsername: user.username,
        memberIds: invited,
      });

      response.status(201).json({
        group: {
          ...group,
          members: residentSocialStore.listMembers(group.id),
        },
      });
    }),
  );

  app.get(
    '/api/phase6/groups/:id/messages',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const group = residentSocialStore.getGroup(request.params.id);

      if (!group) {
        throw new Phase6NotFoundError('group not found');
      }

      if (!residentSocialStore.isMember(group.id, user.id)) {
        throw new Phase6ForbiddenError('只有群成员可查看群聊');
      }

      response.json({
        group,
        members: residentSocialStore.listMembers(group.id),
        messages: residentSocialStore.listGroupMessages(group.id),
      });
    }),
  );

  app.post(
    '/api/phase6/groups/:id/messages',
    asyncHandler(async (request, response) => {
      const authorization = requireAuthorization(request);
      const user = await gateway.authenticate(authorization);
      requireResident(user);

      const group = residentSocialStore.getGroup(request.params.id);

      if (!group) {
        throw new Phase6NotFoundError('group not found');
      }

      if (!residentSocialStore.isMember(group.id, user.id)) {
        throw new Phase6ForbiddenError('只有群成员可发言');
      }

      const content = String(request.body?.content || '').trim();

      if (!content || content.length > 300) {
        throw new Phase6ValidationError(
          'content must be between 1 and 300 characters',
        );
      }

      const message = residentSocialStore.createGroupMessage({
        groupId: group.id,
        fromUserId: user.id,
        fromUsername: user.username,
        content,
      });

      response.status(201).json({ message });
    }),
  );

  // ==========================================================================
  // 阶段七：空间社交内容层（JSON 文件分片存储 + 关键词检索 + 权限校验 + 导出/备份）
  // 仅新增挂载（/api/phase7/*），不修改任何既有 phase6 路由、SQLite 数据与业务逻辑。
  // ==========================================================================
  const phase7 = createPhase7({
    phase6Config: config,
    authenticate: (authorization) => gateway.authenticate(authorization),
    visitorQuotaStore,
    friendStore,
  });
  if (phase7.enabled) {
    app.use('/api', phase7.router);
  }
  app.locals.phase7 = phase7;

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
