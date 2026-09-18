import { WebSocket } from 'ws';
import { createTicketService } from '../../../m1/backend/src/ticketService.js';

export const createM1RealtimeClient = ({
  config,
  logger = console,
  onEvent = () => {},
}) => {
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: 300,
  });
  let socket = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let stopped = true;
  let reconnectAttempts = 0;
  let connected = false;
  let lastEventAt = null;

  const wsUrl = () => {
    const url = new URL(config.m1BaseUrl);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/bp4/realtime';
    url.search = '';
    return url;
  };

  const scheduleReconnect = () => {
    if (stopped) {
      return;
    }

    reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (stopped) {
      return;
    }

    const ticket = ticketService.createTicket({
      user: {
        id: 0,
        username: 'bp4-m3-operations',
        role: 'admin',
      },
      scopes: ['realtime'],
      channelIds: ['world-main'],
    });
    const url = wsUrl();

    url.searchParams.set('ticket', ticket.ticket);
    socket = new WebSocket(url);
    socket.on('open', () => {
      connected = true;
      reconnectAttempts = 0;
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channelId: 'world-main',
        }),
      );
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
      logger.info?.('m1_realtime_connected');
    });
    socket.on('message', (raw) => {
      let message;

      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.id) {
        lastEventAt = new Date().toISOString();
        onEvent(message);
        socket.send(
          JSON.stringify({
            type: 'ack',
            eventId: message.id,
          }),
        );
      }
    });
    socket.on('close', () => {
      connected = false;
      clearInterval(heartbeatTimer);
      scheduleReconnect();
    });
    socket.on('error', (error) => {
      logger.warn?.('m1_realtime_error', {
        message: error.message,
      });
    });
  };

  const start = () => {
    stopped = false;
    connect();
  };

  const stop = () => {
    stopped = true;
    connected = false;
    clearTimeout(reconnectTimer);
    clearInterval(heartbeatTimer);
    socket?.close();
    socket = null;
  };

  const status = () => ({
    connected,
    reconnectAttempts,
    lastEventAt,
    baseUrl: config.m1BaseUrl,
  });

  return Object.freeze({
    start,
    status,
    stop,
  });
};
