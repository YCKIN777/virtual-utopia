import { randomUUID } from 'node:crypto';
import {
  Bp4ConflictError,
  Bp4ForbiddenError,
  Bp4ValidationError,
} from './errors.js';

const EVENT_TYPES = new Set([
  'presence.updated',
  'chat.message.created',
  'avatar.state.updated',
  'home.message.created',
  'event.updated',
  'task.updated',
  'inventory.updated',
  'voice.participant.updated',
]);

export const createRealtimeHub = ({ historyLimit = 1000 } = {}) => {
  const connections = new Map();
  const channels = new Map();
  const connectionSequence = new Map();

  const getChannel = (channelId) => {
    if (!channels.has(channelId)) {
      channels.set(channelId, {
        history: [],
        sequence: 0,
        subscribers: new Set(),
      });
    }

    return channels.get(channelId);
  };

  const assertChannel = (channelId) => {
    if (
      typeof channelId !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{1,63}$/.test(channelId)
    ) {
      throw new Bp4ValidationError(
        'channelId must contain lowercase letters, numbers or hyphens',
      );
    }
  };

  const registerConnection = ({
    connectionId = `bp4-${randomUUID()}`,
    user,
    channelIds = [],
    socket = null,
  }) => {
    const connection = {
      connectionId,
      user,
      channelIds: new Set(channelIds),
      socket,
      subscriptions: new Set(),
      acknowledged: new Set(),
      closed: false,
    };

    connections.set(connectionId, connection);
    connectionSequence.set(connectionId, 0);
    channelIds.forEach((channelId) => {
      assertChannel(channelId);
      const channel = getChannel(channelId);

      channel.subscribers.add(connectionId);
      connection.subscriptions.add(channelId);
    });

    return connection;
  };

  const removeConnection = (connectionId) => {
    const connection = connections.get(connectionId);

    if (!connection) {
      return;
    }

    connection.closed = true;
    connection.subscriptions.forEach((channelId) => {
      getChannel(channelId).subscribers.delete(connectionId);
    });
    connections.delete(connectionId);
    connectionSequence.delete(connectionId);
  };

  const subscribe = (connectionId, channelId) => {
    assertChannel(channelId);
    const connection = connections.get(connectionId);

    if (!connection || connection.closed) {
      throw new Bp4ConflictError('Realtime connection is not available');
    }

    if (connection.channelIds.size && !connection.channelIds.has(channelId)) {
      throw new Bp4ForbiddenError('Channel is not allowed for this ticket');
    }

    const channel = getChannel(channelId);

    channel.subscribers.add(connectionId);
    connection.subscriptions.add(channelId);

    return {
      channelId,
      sequence: channel.sequence,
    };
  };

  const unsubscribe = (connectionId, channelId) => {
    const connection = connections.get(connectionId);

    if (!connection) {
      return;
    }

    getChannel(channelId).subscribers.delete(connectionId);
    connection.subscriptions.delete(channelId);
  };

  const publish = ({
    channelId,
    type,
    data = {},
    actorUserId = null,
    version = 1,
  }) => {
    assertChannel(channelId);

    if (!EVENT_TYPES.has(type)) {
      throw new Bp4ValidationError(`Unsupported realtime event type: ${type}`);
    }

    const channel = getChannel(channelId);
    const event = {
      id: `evt-${randomUUID()}`,
      type,
      version,
      channel: channelId,
      sequence: channel.sequence + 1,
      sentAt: new Date().toISOString(),
      actorUserId,
      data,
    };

    channel.sequence = event.sequence;
    channel.history.push(event);

    if (channel.history.length > historyLimit) {
      channel.history.splice(0, channel.history.length - historyLimit);
    }

    channel.subscribers.forEach((connectionId) => {
      const connection = connections.get(connectionId);

      if (connection?.socket?.readyState === 1) {
        connection.socket.send(JSON.stringify(event));
      }
    });

    return event;
  };

  const resume = (connectionId, channelId, afterSequence = 0) => {
    const connection = connections.get(connectionId);

    if (!connection || connection.closed) {
      throw new Bp4ConflictError('Realtime connection is not available');
    }

    assertChannel(channelId);
    const channel = getChannel(channelId);

    if (connection.channelIds.size && !connection.channelIds.has(channelId)) {
      throw new Bp4ForbiddenError('Channel is not allowed for this ticket');
    }

    return channel.history.filter((event) => event.sequence > afterSequence);
  };

  const acknowledge = (connectionId, eventId) => {
    const connection = connections.get(connectionId);

    if (!connection) {
      throw new Bp4ConflictError('Realtime connection is not available');
    }

    connection.acknowledged.add(eventId);
  };

  const stats = () => ({
    connections: connections.size,
    channels: channels.size,
    history: [...channels.values()].reduce(
      (total, channel) => total + channel.history.length,
      0,
    ),
  });

  return Object.freeze({
    acknowledge,
    getConnection(connectionId) {
      return connections.get(connectionId) || null;
    },
    publish,
    registerConnection,
    removeConnection,
    resume,
    stats,
    subscribe,
    unsubscribe,
  });
};
