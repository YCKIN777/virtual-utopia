import { WebSocket, WebSocketServer } from 'ws';
import { createTicketService } from '../../../m1/backend/src/ticketService.js';
import {
  Bp4ForbiddenError,
  Bp4UnauthorizedError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

export const attachM5RealtimeServer = ({ server, config, hub }) => {
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: 300,
  });
  const webSocketServer = new WebSocketServer({
    noServer: true,
  });

  const handleUpgrade = (request, socket, head) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`,
      );

      if (url.pathname !== '/ws/bp4/m5/realtime') {
        socket.destroy();
        return;
      }

      const claims = ticketService.verifyTicket(url.searchParams.get('ticket'));

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, {
          user: {
            id: Number(claims.sub),
            username: claims.username,
            role: claims.role,
          },
          channelIds: claims.channelIds,
        });
      });
    } catch (error) {
      socket.write(
        `HTTP/1.1 ${error instanceof Bp4UnauthorizedError ? 401 : 403} Unauthorized\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
    }
  };

  webSocketServer.on('connection', (socket, _request, context) => {
    const connection = hub.register({
      user: context.user,
      channelIds: context.channelIds,
      socket,
    });
    let queue = Promise.resolve();

    send(socket, {
      type: 'ready',
      connectionId: connection.connectionId,
      user: context.user,
    });

    socket.on('message', (raw) => {
      queue = queue
        .then(() => {
          let message;

          try {
            message = JSON.parse(raw.toString());
          } catch {
            throw new Bp4ValidationError('Realtime message must be JSON');
          }

          if (message.type === 'ping') {
            send(socket, { type: 'pong' });
            return;
          }

          if (message.type === 'subscribe') {
            const sequence = hub.subscribe(
              connection.connectionId,
              message.channelId,
            );

            send(socket, {
              type: 'subscribed',
              channelId: message.channelId,
              sequence,
            });
            return;
          }

          if (message.type === 'avatar.state.updated') {
            const channelId = message.channelId || 'world-main';
            const currentConnection = hub.getConnection(
              connection.connectionId,
            );

            if (!currentConnection?.subscriptions.has(channelId)) {
              throw new Bp4ForbiddenError(
                'Channel is not subscribed for this connection',
              );
            }

            const data = message.data || {};
            const event = hub.publish({
              channelId,
              type: 'avatar.state.updated',
              actorUserId: connection.user.id,
              data: {
                id:
                  typeof data.id === 'string' && data.id
                    ? data.id
                    : `m5-${connection.user.id}`,
                userId: connection.user.id,
                username: connection.user.username,
                displayName:
                  typeof data.displayName === 'string' && data.displayName
                    ? data.displayName
                    : connection.user.username,
                x: toFiniteNumber(data.x),
                y: toFiniteNumber(data.y),
                z: toFiniteNumber(data.z),
                rotation: toFiniteNumber(data.rotation),
                animationState:
                  data.animationState === 'walk' ? 'walk' : 'idle',
              },
            });

            send(socket, {
              type: 'published',
              eventId: event.id,
              eventType: event.type,
              sequence: event.sequence,
            });
            return;
          }

          if (message.type === 'resume') {
            send(socket, {
              type: 'resume.completed',
              channelId: message.channelId,
              events: hub.resume(
                connection.connectionId,
                message.channelId,
                message.afterSequence,
              ),
            });
            return;
          }

          if (message.type === 'ack') {
            return;
          }

          throw new Bp4ValidationError(
            `Unsupported realtime message: ${message.type}`,
          );
        })
        .catch((error) => {
          send(socket, {
            type: 'error',
            code: error.code || 'M5_REALTIME_ERROR',
            message: error.message,
          });
        });
    });

    socket.on('close', () => {
      hub.remove(connection.connectionId);
    });
  });

  server.on('upgrade', handleUpgrade);

  return {
    close: async () => {
      webSocketServer.clients.forEach((socket) => {
        socket.close(1000, 'M5 service closing');
      });
      await new Promise((resolve) => webSocketServer.close(resolve));
      server.off('upgrade', handleUpgrade);
    },
    ticketService,
  };
};
