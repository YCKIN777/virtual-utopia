import {
  Bp3ConflictError,
  Bp3ForbiddenError,
  Bp3NotFoundError,
  Bp3ValidationError,
} from './errors.js';
import { createOpaqueToken } from './security.js';

const ACCESS_MODES = new Set(['public', 'private', 'request', 'whitelist']);

const now = () => new Date().toISOString();

const isExpired = (value) => Boolean(value && Date.parse(value) <= Date.now());

const defaultRule = (plotId) => ({
  plotId,
  ownerUserId: null,
  accessMode: 'public',
  lockEnabled: false,
  version: 0,
  createdAt: null,
  updatedAt: null,
});

const assertPositiveInteger = (value, field) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Bp3ValidationError(`${field} must be a positive integer`);
  }

  return parsed;
};

const readExpiry = (expiresInSeconds) => {
  if (expiresInSeconds === undefined) {
    return null;
  }

  const parsed = Number(expiresInSeconds);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Bp3ValidationError('expiresInSeconds must be a positive number');
  }

  return new Date(Date.now() + parsed * 1000).toISOString();
};

export const createHomeAccessService = ({
  config,
  repositories,
  authService,
}) => {
  const recordVisit = ({
    plotId,
    user,
    action,
    result,
    reason = null,
    details = {},
  }) => {
    repositories.visitLogs.record({
      plotId,
      userId: user?.id || 0,
      username: user?.username || 'anonymous',
      action,
      result,
      reason,
      details,
    });
  };

  const getExistingRule = (plotId) => repositories.accessRules.get(plotId);

  const getRuleOrCreate = async ({ plotId, user }) => {
    const existing = getExistingRule(plotId);

    if (existing) {
      return existing;
    }

    const ownedPlot = await authService.resolveOwnedPlot({
      authorization: user.authorization,
      user,
    });

    if (ownedPlot !== plotId && user.role !== 'admin') {
      return defaultRule(plotId);
    }

    return repositories.accessRules.upsert({
      plotId,
      ownerUserId: user.id,
      accessMode: 'public',
      lockEnabled: false,
    });
  };

  const assertOwner = async ({ plotId, user }) => {
    const rule = await getRuleOrCreate({ plotId, user });

    if (user.role === 'viewer') {
      throw new Bp3ForbiddenError('Viewers cannot manage home permissions');
    }

    if (user.role === 'admin') {
      return rule;
    }

    if (!rule.ownerUserId || rule.ownerUserId !== user.id) {
      throw new Bp3ForbiddenError('Only the home owner can manage this plot');
    }

    return rule;
  };

  const isBlacklisted = (plotId, userId) => {
    const entry = repositories.visitors.get(plotId, userId);

    if (entry?.listType === 'blacklist' && !isExpired(entry.expiresAt)) {
      return true;
    }

    return false;
  };

  const getActiveGrant = (plotId, userId) => {
    const grant = repositories.accessGrants.findActive(plotId, userId);

    return grant && !isExpired(grant.expiresAt) ? grant : null;
  };

  const getState = async ({ plotId: rawPlotId, user }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await getRuleOrCreate({ plotId, user });
    const owner =
      repositories.plotOwners.getByPlot(plotId) ||
      (rule.ownerUserId
        ? {
            plotId,
            userId: rule.ownerUserId,
          }
        : null);
    const isOwner = user.role === 'admin' || rule.ownerUserId === user.id;
    const canManage =
      user.role !== 'viewer' &&
      (user.role === 'admin' || rule.ownerUserId === user.id);
    const visitorEntry = repositories.visitors.get(plotId, user.id);
    const activeGrant = getActiveGrant(plotId, user.id);

    return {
      plot: {
        id: plotId,
        ownerUserId: owner?.userId || null,
      },
      rule,
      currentUser: {
        role: user.role,
        isOwner,
        canManage,
        visitorType:
          visitorEntry?.listType === 'whitelist'
            ? 'whitelist'
            : visitorEntry?.listType === 'blacklist'
              ? 'blacklist'
              : null,
        activeGrant,
        canEnter: await canEnter({
          plotId,
          user,
          consumeGrant: false,
        }),
      },
      visitors: isOwner ? repositories.visitors.list(plotId) : [],
      requests: isOwner
        ? repositories.accessRequests.listByPlot(plotId)
        : repositories.accessRequests
            .listByRequester(user.id)
            .filter((request) => request.plotId === plotId),
      grants: isOwner
        ? repositories.accessGrants.listByPlot(plotId)
        : activeGrant
          ? [activeGrant]
          : [],
    };
  };

  const updateRule = async ({
    plotId: rawPlotId,
    user,
    accessMode,
    lockEnabled,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await assertOwner({ plotId, user });

    if (accessMode !== undefined && !ACCESS_MODES.has(accessMode)) {
      throw new Bp3ValidationError(
        'accessMode must be public, private, request or whitelist',
      );
    }

    const updated = repositories.accessRules.upsert({
      plotId,
      ownerUserId: rule.ownerUserId || user.id,
      accessMode,
      lockEnabled,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'home.access_rule.updated',
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        accessMode: updated.accessMode,
        lockEnabled: updated.lockEnabled,
      },
    });

    return updated;
  };

  const setLock = async ({ plotId: rawPlotId, user, locked }) => {
    const plotId = authService.validatePlotId(rawPlotId);

    if (typeof locked !== 'boolean') {
      throw new Bp3ValidationError('locked must be a boolean');
    }

    const updated = await updateRule({
      plotId,
      user,
      lockEnabled: locked,
    });

    recordVisit({
      plotId,
      user,
      action: locked ? 'door.locked' : 'door.unlocked',
      result: 'recorded',
    });

    return updated;
  };

  const listVisitors = async ({ plotId: rawPlotId, user }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    await assertOwner({ plotId, user });

    return repositories.visitors.list(plotId);
  };

  const setVisitor = async ({
    plotId: rawPlotId,
    user,
    userId: rawUserId,
    listType,
    expiresAt = null,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const userId = assertPositiveInteger(rawUserId, 'userId');
    const rule = await assertOwner({ plotId, user });

    if (!['whitelist', 'blacklist'].includes(listType)) {
      throw new Bp3ValidationError('listType must be whitelist or blacklist');
    }

    if (expiresAt !== null && Number.isNaN(Date.parse(expiresAt))) {
      throw new Bp3ValidationError('expiresAt must be an ISO date or null');
    }

    const visitor = repositories.visitors.set({
      plotId,
      userId,
      listType,
      grantedBy: user.id,
      expiresAt,
    });

    if (listType === 'blacklist') {
      repositories.accessGrants.revokeForUser(plotId, userId);
    }

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: `home.visitor.${listType}`,
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: { targetUserId: userId },
    });

    return {
      rule,
      visitor,
    };
  };

  const removeVisitor = async ({
    plotId: rawPlotId,
    user,
    userId: rawUserId,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const userId = assertPositiveInteger(rawUserId, 'userId');
    await assertOwner({ plotId, user });

    repositories.visitors.remove(plotId, userId);
    repositories.accessGrants.revokeForUser(plotId, userId);
    recordVisit({
      plotId,
      user,
      action: 'visitor.revoked',
      result: 'recorded',
      details: { targetUserId: userId },
    });
  };

  const createRequest = async ({ plotId: rawPlotId, user, message = null }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await getRuleOrCreate({ plotId, user });

    if (user.role === 'admin' || rule.ownerUserId === user.id) {
      throw new Bp3ConflictError(
        'The home owner does not need an access request',
      );
    }

    if (isBlacklisted(plotId, user.id)) {
      throw new Bp3ForbiddenError('Blacklisted users cannot request access');
    }

    if (repositories.accessRequests.findPending(plotId, user.id)) {
      throw new Bp3ConflictError('An access request is already pending');
    }

    const normalizedMessage =
      typeof message === 'string' ? message.trim().slice(0, 200) : null;
    const request = repositories.accessRequests.create({
      plotId,
      requester: user,
      message: normalizedMessage || null,
    });

    recordVisit({
      plotId,
      user,
      action: 'access.requested',
      result: 'recorded',
      details: { requestId: request.id },
    });

    return request;
  };

  const listRequests = async ({ plotId: rawPlotId, user }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await getRuleOrCreate({ plotId, user });
    const isOwner = user.role === 'admin' || rule.ownerUserId === user.id;

    if (isOwner) {
      return repositories.accessRequests.listByPlot(plotId);
    }

    return repositories.accessRequests
      .listByRequester(user.id)
      .filter((request) => request.plotId === plotId);
  };

  const resolveRequest = async ({
    plotId: rawPlotId,
    user,
    requestId,
    status,
    expiresInSeconds = 86400,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await assertOwner({ plotId, user });
    const request = repositories.accessRequests.get(requestId);

    if (!request || request.plotId !== plotId) {
      throw new Bp3NotFoundError('Access request not found');
    }

    if (request.status !== 'pending') {
      throw new Bp3ConflictError('Only pending requests can be resolved');
    }

    const resolved = repositories.accessRequests.resolve({
      id: requestId,
      status,
      resolverUserId: user.id,
    });

    if (status === 'approved') {
      repositories.accessGrants.create({
        plotId,
        userId: request.requesterUserId,
        grantType: 'request_approval',
        expiresAt: readExpiry(expiresInSeconds),
        maxUses: 1,
        createdBy: user.id,
      });
    }

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: `home.access_request.${status}`,
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        requestId,
        requesterUserId: request.requesterUserId,
      },
    });

    return {
      request: resolved,
      rule,
    };
  };

  const createInvite = async ({
    plotId: rawPlotId,
    user,
    expiresInSeconds = config.inviteDefaultTtlSeconds,
    maxUses = 1,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    await assertOwner({ plotId, user });
    const normalizedMaxUses = assertPositiveInteger(maxUses, 'maxUses');
    const token = createOpaqueToken(24);
    const grant = repositories.accessGrants.create({
      plotId,
      userId: 0,
      grantType: 'temporary_invite',
      token,
      expiresAt: readExpiry(expiresInSeconds),
      maxUses: normalizedMaxUses,
      createdBy: user.id,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'home.invite.created',
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        grantId: grant.id,
        maxUses: normalizedMaxUses,
        expiresAt: grant.expiresAt,
      },
    });

    return {
      invite: grant,
      token,
    };
  };

  const listInvites = async ({ plotId: rawPlotId, user }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    await assertOwner({ plotId, user });

    return repositories.accessGrants
      .listByPlot(plotId)
      .filter((grant) => grant.grantType === 'temporary_invite');
  };

  const revokeGrant = async ({ plotId: rawPlotId, user, grantId }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    await assertOwner({ plotId, user });
    const grant = repositories.accessGrants.get(grantId);

    if (!grant || grant.plotId !== plotId) {
      throw new Bp3NotFoundError('Home access grant not found');
    }

    const revoked = repositories.accessGrants.revoke(grantId);
    recordVisit({
      plotId,
      user,
      action: 'grant.revoked',
      result: 'recorded',
      details: { grantId },
    });

    return revoked;
  };

  const redeemInvite = async ({ token, user }) => {
    if (typeof token !== 'string' || token.length < 16) {
      throw new Bp3ValidationError('Invite token is invalid');
    }

    const invite = repositories.accessGrants.getByToken(token);

    if (!invite || invite.grantType !== 'temporary_invite') {
      throw new Bp3NotFoundError('Invite token was not found');
    }

    if (
      invite.revokedAt ||
      invite.usedCount >= invite.maxUses ||
      isExpired(invite.expiresAt)
    ) {
      throw new Bp3ForbiddenError('Invite token is expired or revoked');
    }

    if (isBlacklisted(invite.plotId, user.id)) {
      throw new Bp3ForbiddenError(
        'Blacklisted users cannot redeem this invite',
      );
    }

    repositories.transaction(() => {
      repositories.accessGrants.consume(invite.id);
      repositories.accessGrants.create({
        plotId: invite.plotId,
        userId: user.id,
        grantType: 'temporary_invite',
        expiresAt: invite.expiresAt,
        maxUses: 1,
        createdBy: invite.createdBy,
      });
    });

    recordVisit({
      plotId: invite.plotId,
      user,
      action: 'invite.redeemed',
      result: 'recorded',
      details: {
        inviteId: invite.id,
      },
    });

    return {
      plotId: invite.plotId,
      expiresAt: invite.expiresAt,
    };
  };

  const canEnter = async ({ plotId: rawPlotId, user, consumeGrant = true }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const rule = await getRuleOrCreate({ plotId, user });

    if (user.role === 'admin' || rule.ownerUserId === user.id) {
      return {
        allowed: true,
        reason: 'owner',
        rule,
        grant: null,
      };
    }

    if (isBlacklisted(plotId, user.id)) {
      return {
        allowed: false,
        reason: 'blacklisted',
        rule,
        grant: null,
      };
    }

    let grant = getActiveGrant(plotId, user.id);

    if (grant) {
      if (consumeGrant) {
        grant = repositories.accessGrants.consume(grant.id);
      }

      return {
        allowed: true,
        reason: 'grant',
        rule,
        grant,
      };
    }

    if (!rule.lockEnabled) {
      return {
        allowed: true,
        reason: 'door_unlocked',
        rule,
        grant: null,
      };
    }

    if (rule.accessMode === 'public') {
      return {
        allowed: true,
        reason: 'public',
        rule,
        grant: null,
      };
    }

    if (rule.accessMode === 'whitelist') {
      const entry = repositories.visitors.get(plotId, user.id);

      if (entry?.listType === 'whitelist' && !isExpired(entry.expiresAt)) {
        return {
          allowed: true,
          reason: 'whitelist',
          rule,
          grant: null,
        };
      }
    }

    return {
      allowed: false,
      reason:
        rule.accessMode === 'private'
          ? 'private'
          : rule.accessMode === 'request'
            ? 'approval_required'
            : 'not_whitelisted',
      rule,
      grant: null,
    };
  };

  const checkAccess = async ({
    plotId: rawPlotId,
    user,
    consumeGrant = true,
  }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const result = await canEnter({
      plotId,
      user,
      consumeGrant,
    });

    recordVisit({
      plotId,
      user,
      action: 'home.enter_checked',
      result: result.allowed ? 'allowed' : 'denied',
      reason: result.reason,
    });

    return result;
  };

  const listLogs = async ({ plotId: rawPlotId, user, limit = 100 }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    await assertOwner({ plotId, user });

    return repositories.visitLogs.list(
      plotId,
      Math.min(Math.max(Number(limit) || 100, 1), 500),
    );
  };

  const cancelRequest = async ({ plotId: rawPlotId, user, requestId }) => {
    const plotId = authService.validatePlotId(rawPlotId);
    const request = repositories.accessRequests.get(requestId);

    if (
      !request ||
      request.plotId !== plotId ||
      request.requesterUserId !== user.id
    ) {
      throw new Bp3NotFoundError('Access request not found');
    }

    if (request.status !== 'pending') {
      throw new Bp3ConflictError('Only pending requests can be cancelled');
    }

    return repositories.accessRequests.resolve({
      id: requestId,
      status: 'cancelled',
      resolverUserId: user.id,
    });
  };

  return Object.freeze({
    cancelRequest,
    checkAccess,
    createInvite,
    createRequest,
    getState,
    listInvites,
    listLogs,
    listRequests,
    listVisitors,
    redeemInvite,
    removeVisitor,
    resolveRequest,
    revokeGrant,
    setLock,
    setVisitor,
    updateRule,
  });
};
