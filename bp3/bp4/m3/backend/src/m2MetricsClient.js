const parsePrometheus = (text) => {
  const metrics = {};

  String(text || '')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const [name, rawValue] = line.trim().split(/\s+/);

      if (!name || rawValue === undefined) {
        return;
      }

      const value = Number(rawValue);

      if (Number.isFinite(value)) {
        metrics[name] = value;
      }
    });

  return metrics;
};

export const createM2MetricsClient = ({
  config,
  fetchImpl = globalThis.fetch,
  logger = console,
}) => {
  let timer = null;
  let snapshot = {
    available: false,
    health: null,
    metrics: {},
    updatedAt: null,
    error: null,
  };

  const poll = async () => {
    try {
      const [healthResponse, metricsResponse] = await Promise.all([
        fetchImpl(`${config.m2BaseUrl}/health`),
        fetchImpl(`${config.m2BaseUrl}/api/bp4/m2/metrics`),
      ]);

      if (!healthResponse.ok || !metricsResponse.ok) {
        throw new Error('M2 metrics endpoint is unavailable');
      }

      snapshot = {
        available: true,
        health: await healthResponse.json(),
        metrics: parsePrometheus(await metricsResponse.text()),
        updatedAt: new Date().toISOString(),
        error: null,
      };
    } catch (error) {
      snapshot = {
        ...snapshot,
        available: false,
        updatedAt: new Date().toISOString(),
        error: error.message,
      };
      logger.warn?.('m2_metrics_poll_failed', {
        message: error.message,
      });
    }
  };

  const start = () => {
    clearInterval(timer);
    void poll();
    timer = setInterval(poll, config.pollIntervalMs);
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
  };

  return Object.freeze({
    getSnapshot: () => ({ ...snapshot }),
    poll,
    start,
    stop,
  });
};
