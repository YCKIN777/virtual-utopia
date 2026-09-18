import {
  Bp3ForbiddenError,
  Bp3ValidationError,
} from '../../../backend/src/errors.js';

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp3ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

export const createMessageService = ({
  config,
  repositories,
  accessService,
}) => {
  const assertCanView = async ({ plotId, user }) => {
    const access = await accessService.checkAccess({
      plotId,
      user,
      consumeGrant: false,
    });

    if (!access.allowed) {
      throw new Bp3ForbiddenError(
        'Home messages are not available for this visitor',
      );
    }

    return access;
  };

  const list = async ({ plotId, user, limit = 100 }) => {
    await assertCanView({ plotId, user });

    return repositories.messages.list(
      plotId,
      Math.min(Math.max(Number(limit) || 100, 1), config.messageLimit),
    );
  };

  const create = async ({ plotId, user, content }) => {
    await assertCanView({ plotId, user });
    const normalized = requireText(content, 'content');

    if (normalized.length > 500) {
      throw new Bp3ValidationError('content cannot exceed 500 characters');
    }

    const message = repositories.messages.create({
      plotId,
      author: user,
      content: normalized,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p2.home_message.created',
      resourceType: 'home-message',
      resourceId: message.id,
      result: 'success',
      details: {
        plotId,
      },
    });

    return message;
  };

  const remove = async ({ plotId, messageId, user }) => {
    const message = repositories.messages.get(messageId);

    if (!message || message.plotId !== plotId) {
      throw new Bp3ForbiddenError(
        'Home message is not available for this operation',
      );
    }

    const access = await accessService.getState({
      plotId,
      user,
    });
    const isOwner = user.role === 'admin' || access.currentUser?.isOwner;
    const isAuthor = message.authorUserId === user.id;

    if (!isOwner && !isAuthor) {
      throw new Bp3ForbiddenError(
        'Only the author or home owner can delete this message',
      );
    }

    const deleted = repositories.messages.softDelete(messageId);

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p2.home_message.deleted',
      resourceType: 'home-message',
      resourceId: messageId,
      result: 'success',
      details: {
        plotId,
      },
    });

    return deleted;
  };

  return Object.freeze({
    create,
    list,
    remove,
  });
};
