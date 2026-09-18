export const createModuleBRealtimeClient = ({
  ticket,
  onEvent = () => {},
  onReady = () => {},
  onError = () => {},
}) => {
  let socket = null;
  let stopped = true;
  let reconnectTimer = null;
  let lastSequence = 0;

  const send = (payload) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }

    return false;
  };

  const connect = () => {
    if (stopped) {
      return;
    }

    const url = new URL('/ws/bp4/realtime', globalThis.location.href);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    socket = new WebSocket(url);
    socket.onopen = () => {
      onReady();
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.id) {
        lastSequence = Math.max(lastSequence, message.sequence || 0);
        send({
          type: 'ack',
          eventId: message.id,
        });
      }

      onEvent(message);
    };
    socket.onerror = () => {
      onError(new Error('聊天实时通道连接失败'));
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
    recall(messageId) {
      return send({
        type: 'chat.recall',
        messageId,
      });
    },
    sendMessage(channel, content) {
      return send({
        type: 'chat.send',
        channel,
        content,
        clientMessageId: `ws-${Date.now()}`,
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
    subscribe(channel) {
      return send({
        type: 'chat.subscribe',
        channel,
      });
    },
  });
};
