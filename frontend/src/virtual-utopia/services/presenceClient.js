import { persistenceClient } from './gatewayClient.js';

export const createPresenceClient = ({
  client = persistenceClient,
  token,
  intervalMs = 250,
  onUpdate = () => {},
  onError = () => {},
} = {}) => {
  let timer = null;
  let positionProvider = () => null;
  let inFlight = false;
  let stopped = true;

  const sync = async () => {
    if (stopped || inFlight || !token) {
      return;
    }

    const position = positionProvider();

    if (!position) {
      return;
    }

    inFlight = true;

    try {
      const payload = await client.updatePresence(token, position);
      onUpdate(payload?.users || []);
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
    }
  };

  const start = (provider) => {
    stop(false);
    stopped = false;
    positionProvider = typeof provider === 'function' ? provider : () => null;
    void sync();
    timer = setInterval(() => {
      void sync();
    }, intervalMs);
  };

  const stop = (notify = true) => {
    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (notify && token) {
      void client.disconnectPresence(token).catch(() => null);
    }
  };

  return Object.freeze({
    start,
    stop,
    sync,
  });
};
