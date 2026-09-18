import { randomUUID } from 'node:crypto';
import {
  Bp4ForbiddenError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';
import { ModuleBNotFoundError } from './errors.js';

const MAX_MESSAGE_LENGTH = 500;

const validateContent = (content) => {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Bp4ValidationError('content must be a non-empty string');
  }

  const normalized = content.trim();

  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new Bp4ValidationError(
      `content must not exceed ${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  return normalized;
};

export const createChatService = ({
  repositories,
  channelAccess,
  sensitiveFilter,
  realtimeHub,
}) => {
  const authorizeChannel = ({ user, authorization, channel }) =>
    channelAccess.authorize({
      user,
      authorization,
      channel,
    });

  const listHistory = async ({ user, authorization, channel, limit = 50 }) => {
    const normalized = await authorizeChannel({
      user,
      authorization,
      channel,
    });
    const messages = repositories.messages.list({
      channelId: normalized.id,
      limit: Math.max(1, Math.min(100, Number(limit) || 50)),
    });

    return {
      channel: normalized,
      messages,
    };
  };

  const sendMessage = async ({
    user,
    authorization,
    channel,
    content,
    clientMessageId,
  }) => {
    const normalized = await authorizeChannel({
      user,
      authorization,
      channel,
    });
    const filterResult = sensitiveFilter.evaluate(validateContent(content));
    const message = repositories.messages.insert({
      id: `msg-${randomUUID()}`,
      clientMessageId,
      channelType: normalized.type,
      channelId: normalized.id,
      senderUserId: user.id,
      senderUsername: user.username,
      content: filterResult.content,
      filtered: filterResult.filtered,
      createdAt: new Date().toISOString(),
    });

    realtimeHub.publish({
      channelId: normalized.id,
      type: 'chat.message.created',
      actorUserId: user.id,
      data: {
        ...message,
        filteredTerms: filterResult.matches,
      },
    });
    repositories.audit.record({
      actor: user,
      action: 'module_b.message.created',
      resourceType: 'message',
      resourceId: message.id,
      result: 'success',
      details: {
        channel: normalized.id,
        filtered: filterResult.filtered,
      },
    });

    return {
      channel: normalized,
      message,
      filteredTerms: filterResult.matches,
    };
  };

  const recallMessage = async ({ user, authorization, messageId }) => {
    const current = repositories.messages.get(messageId);

    if (!current) {
      throw new ModuleBNotFoundError('Message not found');
    }

    if (current.senderUserId !== user.id && user.role !== 'admin') {
      throw new Bp4ForbiddenError(
        'Only the sender or an administrator can recall this message',
      );
    }

    await authorizeChannel({
      user,
      authorization,
      channel: {
        type: current.channelType,
        id: current.channelId,
      },
    });
    const recalledAt = new Date().toISOString();
    const message = repositories.messages.recall({
      messageId,
      recalledBy: user.id,
      recalledAt,
    });

    realtimeHub.publish({
      channelId: current.channelId,
      type: 'event.updated',
      actorUserId: user.id,
      data: {
        kind: 'chat.message.recalled',
        ...message,
      },
    });
    repositories.audit.record({
      actor: user,
      action: 'module_b.message.recalled',
      resourceType: 'message',
      resourceId: messageId,
      result: 'success',
      details: {
        channel: current.channelId,
      },
    });

    return {
      message,
    };
  };

  const listAudit = (user) => {
    if (user.role !== 'admin') {
      throw new Bp4ForbiddenError(
        'Only administrators can inspect chat audit logs',
      );
    }

    return repositories.audit.list(100);
  };

  return Object.freeze({
    authorizeChannel,
    listAudit,
    listHistory,
    recallMessage,
    sendMessage,
  });
};
