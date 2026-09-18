import { persistenceClient } from './gatewayClient.js';

const mergeMessages = (current, incoming) => {
  const messages = new Map(current.map((message) => [message.id, message]));

  incoming.forEach((message) => {
    messages.set(message.id, message);
  });

  return [...messages.values()].sort((left, right) =>
    String(left.createdAt).localeCompare(String(right.createdAt)),
  );
};

export const createWorldChatClient = ({
  client = persistenceClient,
  token,
  pollIntervalMs = 900,
  onMessages = () => {},
  onError = () => {},
} = {}) => {
  let messages = [];
  let timer = null;
  let inFlight = false;
  let stopped = true;

  const publish = (incoming) => {
    messages = mergeMessages(messages, incoming);
    onMessages(messages);
  };

  const sync = async () => {
    if (stopped || inFlight || !token) {
      return;
    }

    inFlight = true;

    try {
      const payload = await client.loadWorldChat(token, 80);
      publish(payload?.messages || []);
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    stop();
    stopped = false;
    void sync();
    timer = setInterval(() => {
      void sync();
    }, pollIntervalMs);
  };

  const send = async (content) => {
    const normalized = String(content || '').trim();

    if (!normalized) {
      return false;
    }

    const payload = await client.sendWorldChat(token, normalized);

    if (payload?.message) {
      publish([payload.message]);
    }

    return true;
  };

  const stop = () => {
    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return Object.freeze({
    send,
    start,
    stop,
    sync,
  });
};
