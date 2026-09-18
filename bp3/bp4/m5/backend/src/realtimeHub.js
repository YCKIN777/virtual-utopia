import { randomUUID } from 'node:crypto';
import {
  Bp4ConflictError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const EVENT_TYPES = new Set([
  'player.presence.updated',
  'avatar.state.updated',
  'voice.participant.updated',
  'home.layout.updated',
]);

export const createM5RealtimeHub = ({ historyLimit = 500 } = {}) => {
  const connections = new Map();
  const channels = new Map();

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

  const register = ({
    connectionId = `m5-${randomUUID()}`,
    user,
    channelIds = ['world-main'],
    socket,
  }) => {
    const connection = {
      connectionId,
      user,
      socket,
      subscriptions: new Set(),
      closed: false,
    };

    connections.set(connectionId, connection);
    channelIds.forEach((channelId) => {
      const channel = getChannel(channelId);

      channel.subscribers.add(connectionId);
      connection.subscriptions.add(channelId);
    });

    return connection;
  };

  const remove = (connectionId) => {
    const connection = connections.get(connectionId);

    if (!connection) {
      return;
    }

    connection.subscriptions.forEach((channelId) => {
      getChannel(channelId).subscribers.delete(connectionId);
    });
    connections.delete(connectionId);
  };

  const publish = ({ channelId, type, data = {}, actorUserId = null }) => {
    if (!EVENT_TYPES.has(type)) {
      throw new Bp4ValidationError(`Unsupported M5 event type: ${type}`);
    }

    const channel = getChannel(channelId);
    const event = {
      id: `evt-${randomUUID()}`,
      type,
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

  const subscribe = (connectionId, channelId) => {
    const connection = connections.get(connectionId);

    if (!connection || connection.closed) {
      throw new Bp4ConflictError('M5 realtime connection is unavailable');
    }

    const channel = getChannel(channelId);

    channel.subscribers.add(connectionId);
    connection.subscriptions.add(channelId);

    return channel.sequence;
  };

  const resume = (connectionId, channelId, afterSequence = 0) => {
    if (!connections.has(connectionId)) {
      throw new Bp4ConflictError('M5 realtime connection is unavailable');
    }

    return getChannel(channelId).history.filter(
      (event) => event.sequence > afterSequence,
    );
  };

  return Object.freeze({
    getConnection(connectionId) {
      return connections.get(connectionId) || null;
    },
    publish,
    register,
    remove,
    resume,
    stats: () => ({
      connections: connections.size,
      channels: channels.size,
      history: [...channels.values()].reduce(
        (total, channel) => total + channel.history.length,
        0,
      ),
    }),
    subscribe,
  });
};
