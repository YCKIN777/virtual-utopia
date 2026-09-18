import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  Bp4M1Error,
  Bp4UnauthorizedError,
  Bp4ValidationError,
} from './errors.js';
import { createRealtimeHub } from './realtimeHub.js';
import { createTicketService } from './ticketService.js';

const writeJson = (response, status, payload) => {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
};

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Bp4ValidationError('Invalid JSON request body');
  }
};

const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

export const createRealtimeServer = ({
  config,
  authAdapter,
  logger = console,
  hub = createRealtimeHub(),
}) => {
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: config.ticketTtlSeconds,
  });
  const webSocketServer = new WebSocketServer({
    noServer: true,
  });

  const handleHttpRequest = async (request, response) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`,
      );

      if (
        request.method === 'GET' &&
        (url.pathname === '/health' || url.pathname === '/api/bp4/m1/health')
      ) {
        writeJson(response, 200, {
          service: 'virtual-utopia-bp4-m1',
          status: 'ok',
          webSocketPath: '/ws/bp4/realtime',
          realtime: hub.stats(),
          postgresConfigured: Boolean(config.databaseUrl),
          sqlitePath: config.sqlitePath,
        });
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/api/bp4/realtime/ticket'
      ) {
        if (!authAdapter) {
          throw new Bp4UnauthorizedError(
            'BP4 identity adapter is not configured',
          );
        }

        const body = await readJsonBody(request);
        const user = await authAdapter.authenticate(
          request.headers.authorization,
        );
        const ticket = ticketService.createTicket({
          user,
          scopes: body.scopes || ['realtime'],
          channelIds: body.channelIds || ['world-main'],
        });

        writeJson(response, 200, ticket);
        return;
      }

      writeJson(response, 404, {
        code: 'BP4_M1_NOT_FOUND',
        message: 'Route not found',
      });
    } catch (error) {
      if (error instanceof Bp4M1Error) {
        writeJson(response, error.status, {
          code: error.code,
          message: error.message,
          details: error.details,
        });
        return;
      }

      logger.error(error.stack || error);
      writeJson(response, 500, {
        code: 'BP4_M1_INTERNAL_ERROR',
        message: 'Internal BP4 M1 service error',
      });
    }
  };

  const server = http.createServer(handleHttpRequest);

  const handleUpgrade = async (request, socket, head) => {
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
      const user = {
        id: Number(claims.sub),
        username: claims.username,
        role: claims.role,
      };

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, {
          user,
          scopes: claims.scopes,
          channelIds: claims.channelIds,
        });
      });
    } catch (error) {
      socket.write(
        `HTTP/1.1 ${error.status || 401} Unauthorized\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
    }
  };

  webSocketServer.on('connection', (socket, _request, claims) => {
    const connection = hub.registerConnection({
      user: claims.user,
      channelIds: claims.channelIds,
      socket,
    });
    let queue = Promise.resolve();

    send(socket, {
      type: 'ready',
      connectionId: connection.connectionId,
      user: claims.user,
      subscriptions: [...connection.subscriptions],
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
            const events = hub.resume(
              connection.connectionId,
              message.channelId,
              message.afterSequence,
            );

            send(socket, {
              type: 'resume.completed',
              channelId: message.channelId,
              events,
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
            code: error.code || 'BP4_REALTIME_ERROR',
            message: error.message,
          });
        });
    });

    socket.on('close', () => {
      hub.removeConnection(connection.connectionId);
    });
  });

  const start = async () => {
    server.on('upgrade', handleUpgrade);

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    return server;
  };

  const close = async () => {
    webSocketServer.clients.forEach((socket) => {
      socket.close(1000, 'BP4 M1 service closing');
    });

    await new Promise((resolve) => webSocketServer.close(resolve));

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };

  return Object.freeze({
    close,
    hub,
    server,
    start,
    ticketService,
  });
};
