export const createTicketContextStore = ({ ttlSeconds = 300 } = {}) => {
  const contexts = new Map();

  const cleanup = () => {
    const now = Date.now();

    for (const [ticket, context] of contexts) {
      if (context.expiresAt <= now) {
        contexts.delete(ticket);
      }
    }
  };

  return Object.freeze({
    clear() {
      contexts.clear();
    },
    get(ticket) {
      cleanup();
      return contexts.get(ticket) || null;
    },
    set(ticket, context) {
      cleanup();
      contexts.set(ticket, {
        ...context,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
  });
};
