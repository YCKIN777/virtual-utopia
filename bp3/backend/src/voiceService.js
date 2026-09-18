import {
  Bp3ForbiddenError,
  Bp3NotFoundError,
  Bp3ValidationError,
} from './errors.js';
import { createSignedToken } from './security.js';

const DEFAULT_CHANNEL = {
  id: 'world-main',
  name: '世界语音',
};

export const createVoiceService = ({ config, repositories }) => {
  const moderationHandlers = new Set();

  const ensureChannel = (channelId = DEFAULT_CHANNEL.id) => {
    if (
      typeof channelId !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{1,48}$/.test(channelId)
    ) {
      throw new Bp3ValidationError(
        'channelId must contain lowercase letters, numbers or hyphens',
      );
    }

    const channel = repositories.voiceChannels.ensure({
      id: channelId,
      name: channelId === DEFAULT_CHANNEL.id ? DEFAULT_CHANNEL.name : channelId,
      createdBy: null,
    });

    if (!channel || channel.status !== 'active') {
      throw new Bp3NotFoundError('Voice channel not found');
    }

    return channel;
  };

  const issueToken = ({ channelId, user }) =>
    createSignedToken({
      secret: config.authSecret,
      ttlSeconds: config.voiceTokenTtlSeconds,
      payload: {
        sub: user.id,
        username: user.username,
        role: user.role,
        channelId,
        scope: 'voice',
      },
    });

  const join = ({ channelId = DEFAULT_CHANNEL.id, user }) => {
    const channel = ensureChannel(channelId);

    if (repositories.voiceBlacklist.has(channelId, user.id)) {
      throw new Bp3ForbiddenError('You are blocked from this voice channel');
    }

    const participant = repositories.voiceParticipants.upsert({
      channelId,
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      role: user.role,
      connectionId: null,
    });
    const token = issueToken({ channelId, user });

    return {
      channel,
      participant,
      ...token,
    };
  };

  const leave = ({ channelId = DEFAULT_CHANNEL.id, userId }) => {
    repositories.voiceParticipants.remove(channelId, userId);
  };

  const listParticipants = (channelId = DEFAULT_CHANNEL.id) =>
    repositories.voiceParticipants.list(channelId);

  const listChannels = () =>
    repositories.voiceChannels.list().map((channel) => ({
      ...channel,
      participantCount: listParticipants(channel.id).length,
    }));

  const setState = ({
    channelId = DEFAULT_CHANNEL.id,
    userId,
    muted,
    speaking,
    connectionId,
  }) =>
    repositories.voiceParticipants.updateState({
      channelId,
      userId,
      muted,
      speaking,
      connectionId,
    });

  const registerModerationHandler = (handler) => {
    moderationHandlers.add(handler);

    return () => moderationHandlers.delete(handler);
  };

  const moderate = async ({
    actor,
    channelId = DEFAULT_CHANNEL.id,
    targetUserId,
    action,
    reason = null,
  }) => {
    if (actor.role !== 'admin') {
      throw new Bp3ForbiddenError('Only administrators can moderate voice');
    }

    if (!['mute', 'unmute', 'kick', 'block', 'unblock'].includes(action)) {
      throw new Bp3ValidationError('Unsupported voice moderation action');
    }

    const target = repositories.voiceParticipants.get(channelId, targetUserId);

    if (!target && !['block', 'unblock'].includes(action)) {
      throw new Bp3NotFoundError('Voice participant not found');
    }

    if (action === 'block') {
      repositories.voiceBlacklist.add({
        channelId,
        userId: targetUserId,
        reason,
        createdBy: actor.id,
      });
    }

    if (action === 'unblock') {
      repositories.voiceBlacklist.remove(channelId, targetUserId);
    }

    if (['mute', 'unmute'].includes(action) && target) {
      setState({
        channelId,
        userId: targetUserId,
        muted: action === 'mute',
        speaking: false,
      });
    }

    const result = {
      action,
      channelId,
      targetUserId,
      reason,
      actor: {
        id: actor.id,
        username: actor.username,
      },
    };

    await Promise.all(
      [...moderationHandlers].map((handler) =>
        Promise.resolve(handler(result)),
      ),
    );

    return result;
  };

  return Object.freeze({
    ensureChannel,
    join,
    leave,
    listChannels,
    listParticipants,
    moderate,
    registerModerationHandler,
    setState,
  });
};
