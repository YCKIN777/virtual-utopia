export const createM5RealtimeClient = ({
  ticket,
  onEvent = () => {},
  onReady = () => {},
  onError = () => {},
}) => {
  let socket = null;
  let stopped = true;
  let reconnectTimer = null;
  let lastSequence = 0;

  const send = (message) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const connect = () => {
    if (stopped) {
      return;
    }

    const url = new URL('/ws/bp4/m5/realtime', globalThis.location.href);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    socket = new WebSocket(url);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channelId: 'world-main',
        }),
      );
      onReady();
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.id) {
        lastSequence = Math.max(lastSequence, message.sequence || 0);
        onEvent(message);
        socket.send(
          JSON.stringify({
            type: 'ack',
            eventId: message.id,
          }),
        );
      }
    };
    socket.onerror = () => {
      onError(new Error('实时连接失败'));
    };
    socket.onclose = () => {
      if (!stopped) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1200);
      }
    };
  };

  return Object.freeze({
    get lastSequence() {
      return lastSequence;
    },
    sendAvatarState(avatar) {
      send({
        type: 'avatar.state.updated',
        channelId: 'world-main',
        data: avatar,
      });
    },
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  });
};
