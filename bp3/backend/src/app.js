import cors from 'cors';
import express from 'express';
import { Bp3Error, Bp3ForbiddenError, Bp3ValidationError } from './errors.js';

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

export const createBp3App = ({
  config,
  repositories,
  authService,
  accessService,
  voiceService,
  signaling,
  mediasoup,
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
      service: 'virtual-utopia-bp3',
      status: 'ok',
    });
  });

  app.get('/api/bp3/health', (_request, response) => {
    response.json({
      service: 'virtual-utopia-bp3',
      status: 'ok',
      databasePath: config.databasePath,
      phase5BaseUrl: config.phase5BaseUrl,
      mediasoupWorkers: mediasoup.workerCount(),
      signalingPath: signaling.path,
    });
  });

  app.get('/api/bp3/auth/me', requireUser, (request, response) => {
    const { authorization: _authorization, ...user } = request.user;

    response.json(user);
  });

  app.get(
    '/api/bp3/me/home',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        plotId: await authService.resolveOwnedPlot({
          authorization: request.user.authorization,
          user: request.user,
        }),
      });
    }),
  );

  app.get('/api/bp3/voice/channels', requireUser, (_request, response) => {
    response.json({
      channels: voiceService.listChannels(),
    });
  });

  app.post(
    '/api/bp3/voice/channels/:channelId/join',
    requireUser,
    asyncHandler(async (request, response) => {
      const result = voiceService.join({
        channelId: request.params.channelId,
        user: request.user,
      });

      response.json(result);
    }),
  );

  app.post(
    '/api/bp3/voice/channels/:channelId/leave',
    requireUser,
    (request, response) => {
      voiceService.leave({
        channelId: request.params.channelId,
        userId: request.user.id,
      });
      response.json({
        left: true,
      });
    },
  );

  app.get(
    '/api/bp3/voice/channels/:channelId/participants',
    requireUser,
    (request, response) => {
      response.json({
        participants: voiceService.listParticipants(request.params.channelId),
      });
    },
  );

  app.post(
    '/api/bp3/voice/channels/:channelId/mute',
    requireUser,
    (request, response) => {
      const muted = Boolean(request.body?.muted);
      const participant = voiceService.setState({
        channelId: request.params.channelId,
        userId: request.user.id,
        muted,
        speaking: false,
      });

      if (!participant) {
        throw new Bp3ValidationError(
          'Join the voice channel before changing mute state',
        );
      }

      response.json({ participant });
    },
  );

  app.post('/api/bp3/voice/token', requireUser, (request, response) => {
    const joined = voiceService.join({
      channelId: request.body?.channelId || 'world-main',
      user: request.user,
    });

    response.json(joined);
  });

  app.post(
    '/api/bp3/voice/channels/:channelId/moderate',
    requireUser,
    asyncHandler(async (request, response) => {
      if (request.user.role !== 'admin') {
        throw new Bp3ForbiddenError('Only administrators can moderate voice');
      }

      const result = await signaling.moderate({
        actor: request.user,
        channelId: request.params.channelId,
        targetUserId: Number(request.body?.targetUserId),
        action: request.body?.action,
        reason: request.body?.reason || null,
      });

      response.json(result);
    }),
  );

  app.get(
    '/api/bp3/homes/:plotId/access',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.getState({
          plotId: request.params.plotId,
          user: request.user,
        }),
      );
    }),
  );

  app.put(
    '/api/bp3/homes/:plotId/access',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        rule: await accessService.updateRule({
          plotId: request.params.plotId,
          user: request.user,
          accessMode: request.body?.accessMode,
          lockEnabled: request.body?.lockEnabled,
        }),
      });
    }),
  );

  app.get(
    '/api/bp3/homes/:plotId/visitors',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        visitors: await accessService.listVisitors({
          plotId: request.params.plotId,
          user: request.user,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/visitors',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.setVisitor({
          plotId: request.params.plotId,
          user: request.user,
          userId: request.body?.userId,
          listType: request.body?.listType,
          expiresAt: request.body?.expiresAt ?? null,
        }),
      );
    }),
  );

  app.delete(
    '/api/bp3/homes/:plotId/visitors/:userId',
    requireUser,
    asyncHandler(async (request, response) => {
      await accessService.removeVisitor({
        plotId: request.params.plotId,
        user: request.user,
        userId: request.params.userId,
      });
      response.json({ removed: true });
    }),
  );

  app.get(
    '/api/bp3/homes/:plotId/access-requests',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        requests: await accessService.listRequests({
          plotId: request.params.plotId,
          user: request.user,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/access-requests',
    requireUser,
    asyncHandler(async (request, response) => {
      response.status(201).json({
        request: await accessService.createRequest({
          plotId: request.params.plotId,
          user: request.user,
          message: request.body?.message,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/access-requests/:requestId/approve',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.resolveRequest({
          plotId: request.params.plotId,
          user: request.user,
          requestId: request.params.requestId,
          status: 'approved',
          expiresInSeconds: request.body?.expiresInSeconds || 86400,
        }),
      );
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/access-requests/:requestId/reject',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.resolveRequest({
          plotId: request.params.plotId,
          user: request.user,
          requestId: request.params.requestId,
          status: 'rejected',
        }),
      );
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/access-requests/:requestId/cancel',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        request: await accessService.cancelRequest({
          plotId: request.params.plotId,
          user: request.user,
          requestId: request.params.requestId,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/unlock',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        rule: await accessService.setLock({
          plotId: request.params.plotId,
          user: request.user,
          locked: Boolean(request.body?.locked),
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/access-check',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.checkAccess({
          plotId: request.params.plotId,
          user: request.user,
          consumeGrant: request.body?.consumeGrant !== false,
        }),
      );
    }),
  );

  app.get(
    '/api/bp3/homes/:plotId/invites',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        invites: await accessService.listInvites({
          plotId: request.params.plotId,
          user: request.user,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/homes/:plotId/invites',
    requireUser,
    asyncHandler(async (request, response) => {
      response.status(201).json(
        await accessService.createInvite({
          plotId: request.params.plotId,
          user: request.user,
          expiresInSeconds: request.body?.expiresInSeconds,
          maxUses: request.body?.maxUses,
        }),
      );
    }),
  );

  app.delete(
    '/api/bp3/homes/:plotId/grants/:grantId',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        grant: await accessService.revokeGrant({
          plotId: request.params.plotId,
          user: request.user,
          grantId: request.params.grantId,
        }),
      });
    }),
  );

  app.post(
    '/api/bp3/invites/:token/redeem',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json(
        await accessService.redeemInvite({
          token: request.params.token,
          user: request.user,
        }),
      );
    }),
  );

  app.get(
    '/api/bp3/homes/:plotId/logs',
    requireUser,
    asyncHandler(async (request, response) => {
      response.json({
        logs: await accessService.listLogs({
          plotId: request.params.plotId,
          user: request.user,
          limit: readLimit(request.query.limit),
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
      code: 'BP3_INTERNAL_ERROR',
      message: 'Internal BP3 service error',
    });
  });

  return app;
};
