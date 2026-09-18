import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { verifySignedToken } from './security.js';
import { Bp3UnauthorizedError } from './errors.js';

const SIGNALING_PATH = '/ws/bp3/voice/signaling';

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const parseMessage = (data) => {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
};

export const createVoiceSignalingServer = ({
  authSecret,
  voiceService,
  mediasoupAdapter,
  repositories,
  logger = console,
}) => {
  const webSocketServer = new WebSocketServer({
    noServer: true,
  });
  const connections = new Map();
  const roomConnections = new Map();
  const handleAudioLevel = ({ roomId, volumes }) => {
    const active = new Set(volumes.map((volume) => volume.producerId));
    const room = roomConnections.get(roomId);

    if (!room) {
      return;
    }

    room.forEach((connection) => {
      let speaking = false;

      for (const producer of connection.producers.values()) {
        if (!producer.paused && active.has(producer.id)) {
          speaking = true;
          break;
        }
      }

      if (connection.speaking !== speaking) {
        connection.speaking = speaking;
        voiceService.setState({
          channelId: connection.channelId,
          userId: connection.user.id,
          speaking,
        });
        broadcast(connection.channelId, {
          type: 'participant.updated',
          participant: {
            userId: connection.user.id,
            speaking,
            muted: connection.muted,
          },
        });
      }
    });
  };

  mediasoupAdapter.events.on('audio-level', handleAudioLevel);

  const getRoom = (channelId) => {
    if (!roomConnections.has(channelId)) {
      roomConnections.set(channelId, new Set());
    }

    return roomConnections.get(channelId);
  };

  const broadcast = (channelId, payload, except = null) => {
    const room = getRoom(channelId);

    room.forEach((connection) => {
      if (connection !== except) {
        sendJson(connection.socket, payload);
      }
    });
  };

  const safeClose = (connection, code, reason) => {
    try {
      connection.socket.close(code, reason);
    } catch {
      // The socket may already be closed.
    }
  };

  const cleanupConnection = (connection, { removeParticipant = true } = {}) => {
    if (!connection || connection.closed) {
      return;
    }

    connection.closed = true;
    connections.delete(connection.id);
    getRoom(connection.channelId).delete(connection);

    connection.producers.forEach((producer) => {
      if (!producer.closed) {
        producer.close();
      }
    });
    connection.consumers.forEach((consumer) => {
      if (!consumer.closed) {
        consumer.close();
      }
    });
    connection.producers.clear();
    connection.consumers.clear();

    if (connection.transport && !connection.transport.closed) {
      connection.transport.close();
    }
    if (connection.recvTransport && !connection.recvTransport.closed) {
      connection.recvTransport.close();
    }

    if (removeParticipant) {
      voiceService.leave({
        channelId: connection.channelId,
        userId: connection.user.id,
      });
      broadcast(connection.channelId, {
        type: 'participant.left',
        userId: connection.user.id,
      });
    }
  };

  const assertConnection = (socket, payload) => {
    const connection = connections.get(payload.connectionId);

    if (!connection || connection.closed || connection.socket !== socket) {
      throw new Error('Voice connection is no longer active');
    }

    return connection;
  };

  const handleProduce = async (connection, message) => {
    if (message.kind !== 'audio') {
      throw new Error('Only audio producers are supported');
    }

    const producer = await connection.transport.produce({
      kind: 'audio',
      rtpParameters: message.rtpParameters,
      appData: {
        userId: connection.user.id,
      },
    });

    connection.producers.set(producer.id, producer);
    producer.on('transportclose', () => {
      connection.producers.delete(producer.id);
    });
    await connection.room.audioLevelObserver.addProducer({
      producerId: producer.id,
    });
    voiceService.setState({
      channelId: connection.channelId,
      userId: connection.user.id,
      muted: false,
      speaking: false,
    });
    connection.muted = false;
    sendJson(connection.socket, {
      type: 'produced',
      id: producer.id,
      kind: producer.kind,
    });
    broadcast(
      connection.channelId,
      {
        type: 'new-producer',
        producerId: producer.id,
        userId: connection.user.id,
        kind: producer.kind,
      },
      connection,
    );
  };

  const handleConsume = async (connection, message) => {
    if (
      !connection.room.router.canConsume({
        producerId: message.producerId,
        rtpCapabilities: message.rtpCapabilities,
      })
    ) {
      throw new Error('The requested producer cannot be consumed');
    }

    const consumer = await connection.recvTransport.consume({
      producerId: message.producerId,
      rtpCapabilities: message.rtpCapabilities,
      paused: false,
      appData: {
        userId: connection.user.id,
      },
    });
    connection.consumers.set(consumer.id, consumer);
    consumer.on('transportclose', () => {
      connection.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
      connection.consumers.delete(consumer.id);
      sendJson(connection.socket, {
        type: 'consumer.closed',
        consumerId: consumer.id,
        producerId: consumer.producerId,
      });
    });

    sendJson(connection.socket, {
      type: 'consumed',
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerPaused: consumer.producerPaused,
    });
  };

  const handleMessage = async (connection, message) => {
    if (!message || typeof message.type !== 'string') {
      throw new Error('Invalid signaling message');
    }

    if (message.type === 'ping') {
      sendJson(connection.socket, {
        type: 'pong',
        at: new Date().toISOString(),
      });
      return;
    }

    if (message.type === 'connect-transport') {
      const transport =
        message.transportId === connection.recvTransport.id
          ? connection.recvTransport
          : connection.transport;

      await transport.connect({
        dtlsParameters: message.dtlsParameters,
      });
      sendJson(connection.socket, {
        type: 'transport.connected',
        transportId: transport.id,
      });
      return;
    }

    if (message.type === 'produce') {
      await handleProduce(connection, message);
      return;
    }

    if (message.type === 'consume') {
      await handleConsume(connection, message);
      return;
    }

    if (message.type === 'resume-consumer') {
      const consumer = connection.consumers.get(message.consumerId);

      if (!consumer) {
        throw new Error('Consumer not found');
      }

      await consumer.resume();
      sendJson(connection.socket, {
        type: 'consumer.resumed',
        consumerId: consumer.id,
      });
      return;
    }

    if (message.type === 'set-muted') {
      await setMuted(connection, Boolean(message.muted));
      return;
    }

    if (message.type === 'speaking') {
      const speaking = Boolean(message.speaking);

      voiceService.setState({
        channelId: connection.channelId,
        userId: connection.user.id,
        speaking,
      });
      connection.speaking = speaking;
      broadcast(
        connection.channelId,
        {
          type: 'participant.updated',
          participant: {
            userId: connection.user.id,
            speaking,
            muted: connection.muted,
          },
        },
        connection,
      );
      return;
    }

    if (message.type === 'leave') {
      safeClose(connection, 1000, 'Voice session ended');
      return;
    }

    throw new Error(`Unsupported signaling type: ${message.type}`);
  };

  const setMuted = async (connection, muted) => {
    for (const producer of connection.producers.values()) {
      if (muted && !producer.paused) {
        await producer.pause();
      }

      if (!muted && producer.paused) {
        await producer.resume();
      }
    }

    connection.muted = muted;
    connection.speaking = false;
    voiceService.setState({
      channelId: connection.channelId,
      userId: connection.user.id,
      muted,
      speaking: false,
    });
    broadcast(connection.channelId, {
      type: 'participant.updated',
      participant: {
        userId: connection.user.id,
        muted,
        speaking: false,
      },
    });
  };

  const handleUpgrade = async (request, socket, head) => {
    try {
      const url = new URL(request.url, 'http://localhost');

      if (url.pathname !== SIGNALING_PATH) {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token');
      const claims = verifySignedToken({
        token,
        secret: authSecret,
      });

      if (
        claims.scope !== 'voice' ||
        !Number.isInteger(Number(claims.sub)) ||
        typeof claims.channelId !== 'string'
      ) {
        throw new Bp3UnauthorizedError('Voice token is invalid');
      }

      const user = {
        id: Number(claims.sub),
        username: claims.username,
        role: claims.role,
        displayName: claims.displayName || claims.username,
      };
      const channelId = claims.channelId;
      const channel = voiceService.ensureChannel(channelId);

      if (repositories.voiceBlacklist.has(channelId, user.id)) {
        throw new Bp3UnauthorizedError(
          'You are blocked from this voice channel',
        );
      }

      const room = await mediasoupAdapter.createRoom(channel.sfuRoomId);
      const transport = await mediasoupAdapter.createTransport(room);
      const recvTransport = await mediasoupAdapter.createTransport(room);
      const connectionId = `voice-${user.id}-${randomUUID()}`;
      const connection = {
        id: connectionId,
        channelId,
        room,
        socket: null,
        transport,
        recvTransport,
        producers: new Map(),
        consumers: new Map(),
        user,
        muted: false,
        speaking: false,
        closed: false,
      };

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        connection.socket = webSocket;
        connections.set(connectionId, connection);
        getRoom(channelId).add(connection);
        webSocketServer.emit('connection', webSocket, request, {
          connection,
        });
      });
    } catch (error) {
      const status =
        error instanceof Bp3UnauthorizedError
          ? '401 Unauthorized'
          : '403 Forbidden';
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    }
  };

  webSocketServer.on('connection', (socket, _request, context) => {
    const connection = context.connection;
    let queue = Promise.resolve();
    const existingProducers = [];

    getRoom(connection.channelId).forEach((candidate) => {
      if (candidate === connection) {
        return;
      }

      candidate.producers.forEach((producer) => {
        existingProducers.push({
          producerId: producer.id,
          userId: candidate.user.id,
          kind: producer.kind,
        });
      });
    });

    sendJson(socket, {
      type: 'ready',
      connectionId: connection.id,
      user: connection.user,
      channelId: connection.channelId,
      rtpCapabilities: connection.room.router.rtpCapabilities,
      transport: mediasoupAdapter.serializeTransport(connection.transport),
      recvTransport: mediasoupAdapter.serializeTransport(
        connection.recvTransport,
      ),
      existingProducers,
      participants: voiceService.listParticipants(connection.channelId),
    });

    broadcast(
      connection.channelId,
      {
        type: 'participant.joined',
        participant: repositories.voiceParticipants.get(
          connection.channelId,
          connection.user.id,
        ),
      },
      connection,
    );

    socket.on('message', (data) => {
      const message = parseMessage(data);

      if (!message) {
        sendJson(socket, {
          type: 'error',
          code: 'BP3_SIGNALING_PARSE_ERROR',
          message: 'Invalid JSON payload',
        });
        return;
      }

      queue = queue
        .then(() => handleMessage(connection, message))
        .catch((error) => {
          sendJson(socket, {
            type: 'error',
            code: error.code || 'BP3_SIGNALING_ERROR',
            message: error.message || 'Signaling failed',
          });
        });
    });

    socket.on('close', () => {
      cleanupConnection(connection);
    });
    socket.on('error', (error) => {
      logger.error(
        JSON.stringify({
          service: 'virtual-utopia-bp3',
          event: 'voice_socket_error',
          connectionId: connection.id,
          message: error.message,
        }),
      );
    });
  });

  const attach = (server) => {
    server.on('upgrade', handleUpgrade);
  };

  const moderate = async ({
    actor,
    channelId,
    targetUserId,
    action,
    reason,
  }) => {
    const result = await voiceService.moderate({
      actor,
      channelId,
      targetUserId,
      action,
      reason,
    });

    getRoom(channelId).forEach((connection) => {
      if (connection.user.id !== targetUserId) {
        return;
      }

      if (action === 'mute' || action === 'unmute') {
        void setMuted(connection, action === 'mute');
      }

      if (action === 'kick' || action === 'block') {
        sendJson(connection.socket, {
          type: 'moderation.kicked',
          reason: result.reason,
        });
        safeClose(
          connection,
          4003,
          action === 'block'
            ? 'Blocked from voice channel'
            : 'Removed from voice channel',
        );
      }
    });

    return result;
  };

  const close = async () => {
    mediasoupAdapter.events.off('audio-level', handleAudioLevel);
    connections.forEach((connection) => {
      cleanupConnection(connection);
    });
    connections.clear();
    roomConnections.clear();
    await new Promise((resolve) => webSocketServer.close(resolve));
  };

  return Object.freeze({
    attach,
    broadcast,
    close,
    moderate,
    path: SIGNALING_PATH,
  });
};
