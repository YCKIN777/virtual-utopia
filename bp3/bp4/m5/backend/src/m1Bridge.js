import { WebSocket } from 'ws';
import { createTicketService } from '../../../m1/backend/src/ticketService.js';

export const createM1Bridge = ({ config, hub, logger = console }) => {
  const ticketService = createTicketService({
    secret: config.ticketSecret,
    ttlSeconds: 300,
  });
  let socket = null;
  let stopped = true;
  let reconnectTimer = null;
  let connected = false;
  let lastEventAt = null;

  const connect = () => {
    if (stopped) {
      return;
    }

    const url = new URL(config.m1BaseUrl);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/bp4/realtime';
    url.search = '';
    url.searchParams.set(
      'ticket',
      ticketService.createTicket({
        user: {
          id: 0,
          username: 'bp4-m5-bridge',
          role: 'admin',
        },
        scopes: ['realtime'],
        channelIds: ['world-main'],
      }).ticket,
    );

    socket = new WebSocket(url);
    socket.on('open', () => {
      connected = true;
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channelId: 'world-main',
        }),
      );
      logger.info?.('m1_bridge_connected');
    });
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString());

      if (!event.id) {
        return;
      }

      lastEventAt = new Date().toISOString();
      if (event.type === 'presence.updated') {
        hub.publish({
          channelId: 'world-main',
          type: 'player.presence.updated',
          actorUserId: event.actorUserId,
          data: event.data,
        });
      } else if (event.type === 'avatar.state.updated') {
        hub.publish({
          channelId: 'world-main',
          type: 'avatar.state.updated',
          actorUserId: event.actorUserId,
          data: event.data,
        });
      } else if (event.type === 'voice.participant.updated') {
        hub.publish({
          channelId: 'world-main',
          type: 'voice.participant.updated',
          actorUserId: event.actorUserId,
          data: event.data,
        });
      }
    });
    socket.on('close', () => {
      connected = false;
      if (!stopped) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1500);
      }
    });
    socket.on('error', (error) => {
      logger.warn?.('m1_bridge_error', {
        message: error.message,
      });
    });
  };

  return Object.freeze({
    start() {
      stopped = false;
      connect();
    },
    status() {
      return {
        connected,
        lastEventAt,
        baseUrl: config.m1BaseUrl,
      };
    },
    stop() {
      stopped = true;
      connected = false;
      clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  });
};
