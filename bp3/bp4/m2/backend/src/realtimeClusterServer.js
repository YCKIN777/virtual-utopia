import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  Bp4M1Error,
  Bp4UnauthorizedError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';
import { evaluateAlerts } from './monitoring.js';
import { createRealtimeHub } from '../../../m1/backend/src/realtimeHub.js';
import { createTicketService } from '../../../m1/backend/src/ticketService.js';

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

export const createRealtimeClusterServer = ({
  config,
  authAdapter,
  cluster,
  turnService,
  mediaSignaling,
  monitor,
  logger = console,
  backupService,
  hub: providedHub,
}) => {
  const hub = providedHub || createRealtimeHub();
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: config.ticketTtlSeconds,
  });
  const webSocketServer = new WebSocketServer({
    noServer: true,
  });
  let activeConnections = 0;

  const handleHttpRequest = async (request, response) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`,
      );
      monitor.increment('http.requests');

      if (
        request.method === 'GET' &&
        (url.pathname === '/health' || url.pathname === '/api/bp4/m2/health')
      ) {
        const health = cluster.healthCheck();

        writeJson(response, health.healthy ? 200 : 503, {
          service: 'virtual-utopia-bp4-m2',
          status: health.healthy ? 'ok' : 'degraded',
          webSocketPath: '/ws/bp4/realtime',
          cluster: health,
          turn: turnService.healthCheck(),
          media: mediaSignaling.stats(),
          realtime: hub.stats(),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/bp4/m2/metrics') {
        response.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4',
        });
        response.end(
          monitor.prometheus({
            cluster: cluster.stats(),
            turn: turnService.healthCheck(),
            media: mediaSignaling.stats(),
          }),
        );
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/api/bp4/realtime/ticket'
      ) {
        const body = await readJsonBody(request);
        const user = await authenticateRequest(request);

        writeJson(
          response,
          200,
          ticketService.createTicket({
            user,
            scopes: body.scopes || ['realtime', 'voice'],
            channelIds: body.channelIds || ['world-main'],
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/api/bp4/m2/turn/credentials'
      ) {
        await authenticateRequest(request);
        writeJson(response, 200, {
          iceServers: turnService.getIceServers(),
          turn: turnService.healthCheck(),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/bp4/m2/cluster') {
        await authenticateRequest(request);
        writeJson(response, 200, {
          cluster: cluster.healthCheck(),
          media: mediaSignaling.stats(),
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/bp4/m2/alerts') {
        const metrics = monitor.snapshot({
          cluster: cluster.stats(),
          turn: turnService.healthCheck(),
          media: mediaSignaling.stats(),
        });

        writeJson(response, 200, {
          alerts: evaluateAlerts({ metrics }),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/bp4/m2/backups') {
        await authenticateRequest(request);
        const body = await readJsonBody(request);

        writeJson(
          response,
          200,
          await backupService.create({
            dryRun: body.dryRun === true,
          }),
        );
        return;
      }

      writeJson(response, 404, {
        code: 'BP4_M2_NOT_FOUND',
        message: 'Route not found',
      });
    } catch (error) {
      monitor.increment('http.errors');

      if (error instanceof Bp4M1Error) {
        writeJson(response, error.status, {
          code: error.code,
          message: error.message,
          details: error.details,
        });
        return;
      }

      logger.error?.('http_request_failed', {
        message: error.message,
      });
      writeJson(response, 500, {
        code: 'BP4_M2_INTERNAL_ERROR',
        message: 'Internal BP4 M2 service error',
      });
    }
  };

  const authenticateRequest = async (request) => {
    if (!authAdapter) {
      throw new Bp4UnauthorizedError('BP4 identity adapter is not configured');
    }

    return authAdapter.authenticate(request.headers.authorization);
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

      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, {
          user: {
            id: Number(claims.sub),
            username: claims.username,
            role: claims.role,
          },
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

    activeConnections += 1;
    monitor.setGauge('realtime.connections', activeConnections);
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

          const handledByMedia = await mediaSignaling.handleMessage({
            connection,
            socket,
            message,
            user: claims.user,
          });

          if (handledByMedia) {
            return;
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
          monitor.increment('websocket.errors');
          send(socket, {
            type: 'error',
            code: error.code || 'BP4_REALTIME_ERROR',
            message: error.message,
          });
        });
    });

    socket.on('close', () => {
      activeConnections = Math.max(0, activeConnections - 1);
      monitor.setGauge('realtime.connections', activeConnections);
      void mediaSignaling.closeConnection(connection.connectionId);
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
      socket.close(1000, 'BP4 M2 service closing');
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
