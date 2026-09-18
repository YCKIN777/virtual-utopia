import {
  Bp4ForbiddenError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const ACCESS_MODES = new Set(['private', 'friends', 'public']);
const ACTIONS = new Set(['view', 'edit']);

const normalizeFriendUserIds = (friendUserIds) => {
  if (friendUserIds === undefined) {
    return [];
  }

  if (!Array.isArray(friendUserIds)) {
    throw new Bp4ValidationError('friendUserIds must be an array');
  }

  return [...new Set(friendUserIds.map((value) => Number(value)))].filter(
    (value) => Number.isInteger(value) && value > 0,
  );
};

const normalizeOwnerUserId = (ownerUserId) => {
  const value = Number(ownerUserId);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Bp4ValidationError('ownerUserId must be a positive integer');
  }

  return value;
};

const normalizeAction = (action) => {
  if (!ACTIONS.has(action)) {
    throw new Bp4ValidationError('action must be view or edit');
  }

  return action;
};

export const createHomeAccessService = ({
  repositories,
  rbac,
  realtimeHub,
}) => {
  const getHome = (plotId) =>
    repositories.homes.get(plotId) || repositories.homes.ensure(plotId);

  const canManage = (user, home) =>
    home.ownerUserId === user.id ||
    ['operator', 'admin'].includes(rbac.effectiveRole(user));

  const requireManage = (user, home) => {
    if (!canManage(user, home)) {
      throw new Bp4ForbiddenError(
        'Only the owner or an operator can manage home access',
      );
    }
  };

  const evaluate = ({ home, user, action = 'view' }) => {
    const normalizedAction = normalizeAction(action);
    const role = rbac.effectiveRole(user);

    if (normalizedAction === 'edit') {
      return {
        allowed: home.ownerUserId === user.id,
        reason: home.ownerUserId === user.id ? 'owner' : 'visitor_read_only',
      };
    }

    if (
      home.ownerUserId === user.id ||
      role === 'admin' ||
      home.accessMode === 'public'
    ) {
      return {
        allowed: true,
        reason:
          home.ownerUserId === user.id
            ? 'owner'
            : role === 'admin'
              ? 'administrator'
              : 'public',
      };
    }

    if (home.accessMode === 'friends' && home.friendUserIds.includes(user.id)) {
      return {
        allowed: true,
        reason: 'friend',
      };
    }

    return {
      allowed: false,
      reason: home.accessMode === 'private' ? 'private' : 'not_friend',
    };
  };

  const list = (user) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);

    return repositories.homes.list();
  };

  const summary = (user) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);

    const row = repositories.homes.summary();

    return {
      total: Number(row.total || 0),
      unassigned: Number(row.unassigned || 0),
      private: Number(row.private_count || 0),
      friends: Number(row.friends_count || 0),
      public: Number(row.public_count || 0),
    };
  };

  const getAccess = (user, plotId) => {
    const home = getHome(plotId);

    requireManage(user, home);
    return home;
  };

  const evaluateCurrentUser = ({ user, plotId, action }) => {
    const home = getHome(plotId);
    const result = evaluate({
      home,
      user,
      action,
    });

    return {
      plotId,
      action,
      ...result,
      home,
    };
  };

  const evaluateTargetUser = ({ user, plotId, targetUserId, action }) => {
    const home = getHome(plotId);

    rbac.requireRole(user, ['operator', 'admin']);
    const targetUser = {
      id: normalizeOwnerUserId(targetUserId),
      role: 'editor',
    };

    return {
      plotId,
      action,
      ...evaluate({
        home,
        user: targetUser,
        action,
      }),
      home,
    };
  };

  const updateOwner = ({ user, plotId, ownerUserId, ownerUsername }) => {
    rbac.requireRole(user, ['operator', 'admin']);
    const normalizedOwnerUserId = normalizeOwnerUserId(ownerUserId);
    const home = repositories.homes.updateOwner({
      plotId,
      ownerUserId: normalizedOwnerUserId,
      ownerUsername:
        typeof ownerUsername === 'string' && ownerUsername.trim()
          ? ownerUsername.trim()
          : `user-${normalizedOwnerUserId}`,
    });
    const event = {
      kind: 'home.ownership.updated',
      plotId,
      ownerUserId: home.ownerUserId,
      ownerUsername: home.ownerUsername,
      accessMode: home.accessMode,
      friendUserIds: home.friendUserIds,
      version: home.version,
      updatedAt: home.updatedAt,
    };

    repositories.events.append({
      plotId,
      actorUserId: user.id,
      eventType: event.kind,
      mode: home.accessMode,
      ownerUserId: home.ownerUserId,
      payload: event,
      version: home.version,
    });
    realtimeHub.publish({
      channelId: 'world-main',
      type: 'event.updated',
      actorUserId: user.id,
      data: event,
    });
    repositories.audit.record({
      actor: user,
      action: 'module_a.home.owner_updated',
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        ownerUserId: home.ownerUserId,
      },
    });

    return {
      home,
      event,
    };
  };

  const updateAccess = ({ user, plotId, accessMode, friendUserIds }) => {
    if (!ACCESS_MODES.has(accessMode)) {
      throw new Bp4ValidationError(
        'accessMode must be private, friends or public',
      );
    }

    const currentHome = getHome(plotId);

    requireManage(user, currentHome);
    const normalizedFriendUserIds = normalizeFriendUserIds(
      friendUserIds,
    ).filter((userId) => userId !== currentHome.ownerUserId);
    const home = repositories.homes.updateAccess({
      plotId,
      accessMode,
      friendUserIds:
        accessMode === 'friends'
          ? normalizedFriendUserIds
          : currentHome.friendUserIds,
    });
    const event = {
      kind: 'home.access.updated',
      plotId,
      accessMode: home.accessMode,
      ownerUserId: home.ownerUserId,
      friendUserIds: home.friendUserIds,
      version: home.version,
      updatedAt: home.updatedAt,
    };

    repositories.events.append({
      plotId,
      actorUserId: user.id,
      eventType: event.kind,
      mode: home.accessMode,
      ownerUserId: home.ownerUserId,
      payload: event,
      version: home.version,
    });
    realtimeHub.publish({
      channelId: 'world-main',
      type: 'event.updated',
      actorUserId: user.id,
      data: event,
    });
    repositories.audit.record({
      actor: user,
      action: 'module_a.home.access_updated',
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        accessMode: home.accessMode,
        friendUserIds: home.friendUserIds,
      },
    });

    return {
      home,
      event,
    };
  };

  const listEvents = ({ user, plotId = null, limit = 100 }) => {
    rbac.requireRole(user, ['viewer', 'operator', 'admin']);
    return repositories.events.list(plotId, limit);
  };

  const listAudit = (user) => {
    rbac.requireRole(user, ['admin']);
    return repositories.audit.list(100);
  };

  return Object.freeze({
    evaluateCurrentUser,
    evaluateTargetUser,
    getAccess,
    list,
    listAudit,
    listEvents,
    summary,
    updateAccess,
    updateOwner,
  });
};
