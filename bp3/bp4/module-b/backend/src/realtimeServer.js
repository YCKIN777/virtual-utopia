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

export const attachModuleBRealtimeServer = ({
  server,
  config,
  hub,
  chatService,
  ticketContextStore,
}) => {
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

      const ticket = url.searchParams.get('ticket');
      const claims = ticketService.verifyTicket(ticket);
      const context = ticketContextStore.get(ticket);

      if (!context) {
        throw new Bp4UnauthorizedError(
          'Realtime ticket context is unavailable',
        );
      }

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, {
          user: {
            id: Number(claims.sub),
            username: claims.username,
            role: claims.role,
          },
          authorization: context.authorization,
          channelIds: [],
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
    });

    socket.on('message', (raw) => {
      queue = queue
        .then(async () => {
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

          if (
            message.type === 'subscribe' ||
            message.type === 'chat.subscribe'
          ) {
            const normalized = await chatService.authorizeChannel({
              user: context.user,
              authorization: context.authorization,
              channel:
                message.type === 'chat.subscribe'
                  ? message.channel
                  : message.channelId,
            });
            const result = hub.subscribe(
              connection.connectionId,
              normalized.id,
            );

            send(socket, {
              type: 'subscribed',
              channel: normalized,
              channelId: normalized.id,
              sequence: result.sequence,
            });
            return;
          }

          if (message.type === 'chat.send') {
            const result = await chatService.sendMessage({
              user: context.user,
              authorization: context.authorization,
              channel: message.channel,
              content: message.content,
              clientMessageId: message.clientMessageId,
            });

            send(socket, {
              type: 'chat.message.ack',
              channel: result.channel,
              messageId: result.message.id,
              clientMessageId: result.message.clientMessageId,
              filtered: result.message.filtered,
            });
            return;
          }

          if (message.type === 'chat.recall') {
            const result = await chatService.recallMessage({
              user: context.user,
              authorization: context.authorization,
              messageId: message.messageId,
            });

            send(socket, {
              type: 'chat.message.recall.ack',
              messageId: result.message.id,
            });
            return;
          }

          if (message.type === 'ack') {
            hub.acknowledge(connection.connectionId, message.eventId);
            return;
          }

          if (message.type === 'resume') {
            const normalized = await chatService.authorizeChannel({
              user: context.user,
              authorization: context.authorization,
              channel: message.channelId,
            });

            send(socket, {
              type: 'resume.completed',
              channelId: normalized.id,
              events: hub.resume(
                connection.connectionId,
                normalized.id,
                message.afterSequence,
              ),
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

          throw new Bp4ValidationError(
            `Unsupported realtime message: ${message.type}`,
          );
        })
        .catch((error) => {
          send(socket, {
            type: 'error',
            code: error.code || 'MODULE_B_REALTIME_ERROR',
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
      webSocketServer.clients.forEach((client) => {
        client.close(1000, 'Module B service closing');
      });
      await new Promise((resolve) => webSocketServer.close(resolve));
      server.off('upgrade', handleUpgrade);
    },
    ticketService,
  };
};
