import {
  Bp4ConflictError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

export const createMediaSignaling = ({
  cluster,
  hub,
  turnService,
  monitor,
  logger = console,
}) => {
  const connections = new Map();

  const getConnectionMedia = (connectionId) => {
    if (!connections.has(connectionId)) {
      connections.set(connectionId, {
        roomId: null,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }

    return connections.get(connectionId);
  };

  const send = (socket, payload) => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(payload));
    }
  };

  const assertAllowedRoom = (connection, roomId) => {
    if (connection.channelIds.size && !connection.channelIds.has(roomId)) {
      throw new Bp4ValidationError('Room is not allowed for this ticket');
    }
  };

  const createTransport = async ({ connection, socket, message }) => {
    const roomId = message.roomId || 'world-main';

    assertAllowedRoom(connection, roomId);
    const mediaState = getConnectionMedia(connection.connectionId);
    const serializedTransport = await cluster.createTransport(roomId);
    const transport = cluster.getTransport(roomId, serializedTransport.id);

    mediaState.roomId = roomId;
    mediaState.transports.set(serializedTransport.id, {
      transport,
      direction: message.direction || 'sendrecv',
    });
    monitor?.increment('media.transports.created');
    send(socket, {
      type: 'media.transport.created',
      roomId,
      transport: serializedTransport,
      iceServers: turnService.getIceServers(),
    });
  };

  const connectTransport = async ({ connection, message }) => {
    const mediaState = getConnectionMedia(connection.connectionId);
    const record = mediaState.transports.get(message.transportId);

    if (!record) {
      throw new Bp4ConflictError('Media transport not found');
    }

    await record.transport.connect({
      dtlsParameters: message.dtlsParameters,
    });
    monitor?.increment('media.transports.connected');
  };

  const produce = async ({ connection, socket, message, user }) => {
    if (message.kind !== 'audio') {
      throw new Bp4ValidationError('BP4-M2 supports audio producers only');
    }

    const mediaState = getConnectionMedia(connection.connectionId);
    const record = mediaState.transports.get(message.transportId);

    if (!record) {
      throw new Bp4ConflictError('Media transport not found');
    }

    const producer = await record.transport.produce({
      kind: 'audio',
      rtpParameters: message.rtpParameters,
      appData: {
        userId: user.id,
      },
    });

    mediaState.producers.set(producer.id, producer);
    producer.on('transportclose', () => {
      mediaState.producers.delete(producer.id);
    });
    monitor?.increment('media.producers.created');
    hub.publish({
      channelId: mediaState.roomId,
      type: 'voice.participant.updated',
      actorUserId: user.id,
      data: {
        userId: user.id,
        producerId: producer.id,
        muted: false,
        speaking: false,
      },
    });
    send(socket, {
      type: 'media.produced',
      producerId: producer.id,
      kind: producer.kind,
    });
  };

  const consume = async ({ connection, socket, message }) => {
    const mediaState = getConnectionMedia(connection.connectionId);
    const room = cluster.getRoom(mediaState.roomId);

    if (!room) {
      throw new Bp4ConflictError('Media room not found');
    }

    if (
      !room.router.canConsume({
        producerId: message.producerId,
        rtpCapabilities: message.rtpCapabilities,
      })
    ) {
      throw new Bp4ConflictError('Producer cannot be consumed');
    }

    const record = mediaState.transports.get(message.transportId);

    if (!record) {
      throw new Bp4ConflictError('Media transport not found');
    }

    const consumer = await record.transport.consume({
      producerId: message.producerId,
      rtpCapabilities: message.rtpCapabilities,
      paused: false,
    });

    mediaState.consumers.set(consumer.id, consumer);
    monitor?.increment('media.consumers.created');
    send(socket, {
      type: 'media.consumed',
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerPaused: consumer.producerPaused,
    });
  };

  const pauseOrResumeProducer = async ({ connection, message }) => {
    const mediaState = getConnectionMedia(connection.connectionId);
    const producer = mediaState.producers.get(message.producerId);

    if (!producer) {
      throw new Bp4ConflictError('Media producer not found');
    }

    if (message.type === 'media.producer.pause') {
      await producer.pause();
    } else {
      await producer.resume();
    }

    hub.publish({
      channelId: mediaState.roomId,
      type: 'voice.participant.updated',
      data: {
        userId: connection.user.id,
        producerId: producer.id,
        muted: message.type === 'media.producer.pause',
        speaking: false,
      },
    });
  };

  const handleMessage = async ({ connection, socket, message, user }) => {
    if (!message?.type?.startsWith('media.')) {
      return false;
    }

    if (message.type === 'media.transport.create') {
      await createTransport({ connection, socket, message });
      return true;
    }

    if (message.type === 'media.transport.connect') {
      await connectTransport({ connection, message });
      return true;
    }

    if (message.type === 'media.produce') {
      await produce({
        connection,
        socket,
        message,
        user,
      });
      return true;
    }

    if (message.type === 'media.consume') {
      await consume({ connection, socket, message });
      return true;
    }

    if (
      message.type === 'media.producer.pause' ||
      message.type === 'media.producer.resume'
    ) {
      await pauseOrResumeProducer({
        connection,
        message,
      });
      return true;
    }

    if (message.type === 'media.leave') {
      await closeConnection(connection.connectionId);
      return true;
    }

    throw new Bp4ValidationError(`Unsupported media message: ${message.type}`);
  };

  const closeConnection = async (connectionId) => {
    const mediaState = connections.get(connectionId);

    if (!mediaState) {
      return;
    }

    mediaState.producers.forEach((producer) => {
      if (!producer.closed) {
        producer.close();
      }
    });
    mediaState.consumers.forEach((consumer) => {
      if (!consumer.closed) {
        consumer.close();
      }
    });
    mediaState.transports.forEach(({ transport }) => {
      if (!transport.closed) {
        transport.close();
      }
    });
    connections.delete(connectionId);
    monitor?.increment('media.connections.closed');
  };

  const stats = () => ({
    connections: connections.size,
    transports: [...connections.values()].reduce(
      (total, state) => total + state.transports.size,
      0,
    ),
    producers: [...connections.values()].reduce(
      (total, state) => total + state.producers.size,
      0,
    ),
    consumers: [...connections.values()].reduce(
      (total, state) => total + state.consumers.size,
      0,
    ),
  });

  return Object.freeze({
    closeConnection,
    handleMessage,
    stats,
  });
};
