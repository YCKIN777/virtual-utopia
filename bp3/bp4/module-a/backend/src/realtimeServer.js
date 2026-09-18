import { WebSocket, WebSocketServer } from 'ws';
import { createTicketService } from '../../../m1/backend/src/ticketService.js';
import {
  Bp4UnauthorizedError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';

const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

export const attachModuleARealtimeServer = ({ server, config, hub }) => {
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: config.ticketTtlSeconds,
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

      if (url.pathname !== '/ws/bp4/realtime') {
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
    const connection = hub.registerConnection({
      user: context.user,
      channelIds: context.channelIds,
      socket,
    });
    let queue = Promise.resolve();

    send(socket, {
      type: 'ready',
      connectionId: connection.connectionId,
      user: context.user,
      subscriptions: [...connection.subscriptions],
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
            send(socket, {
              type: 'pong',
              sentAt: new Date().toISOString(),
            });
            return;
          }

          if (message.type === 'subscribe') {
            const result = hub.subscribe(
              connection.connectionId,
              message.channelId,
            );

            send(socket, {
              type: 'subscribed',
              channelId: message.channelId,
              sequence: result.sequence,
            });
            return;
          }

          if (message.type === 'unsubscribe') {
            hub.unsubscribe(connection.connectionId, message.channelId);
            send(socket, {
              type: 'unsubscribed',
              channelId: message.channelId,
            });
            return;
          }

          if (message.type === 'ack') {
            hub.acknowledge(connection.connectionId, message.eventId);
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

          throw new Bp4ValidationError(
            `Unsupported realtime message: ${message.type}`,
          );
        })
        .catch((error) => {
          send(socket, {
            type: 'error',
            code: error.code || 'MODULE_A_REALTIME_ERROR',
            message: error.message,
          });
        });
    });

    socket.on('close', () => {
      hub.removeConnection(connection.connectionId);
    });
  });

  server.on('upgrade', handleUpgrade);

  return {
    close: async () => {
      webSocketServer.clients.forEach((socket) => {
        socket.close(1000, 'Module A service closing');
      });
      await new Promise((resolve) => webSocketServer.close(resolve));
      server.off('upgrade', handleUpgrade);
    },
    ticketService,
  };
};
