const parsePrometheus = (text) => {
  const metrics = {};

  String(text || '')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const [name, rawValue] = line.trim().split(/\s+/);
      const value = Number(rawValue);

      if (name && Number.isFinite(value)) {
        metrics[name] = value;
      }
    });

  return metrics;
};

export const createMetricsAggregator = ({
  config,
  fetchImpl = globalThis.fetch,
  logger = console,
}) => {
  let timer = null;
  let snapshot = {
    updatedAt: null,
    m1: {
      available: false,
      health: null,
      error: null,
    },
    m2: {
      available: false,
      health: null,
      metrics: {},
      error: null,
    },
  };

  const poll = async () => {
    const next = {
      updatedAt: new Date().toISOString(),
      m1: {
        available: false,
        health: null,
        error: null,
      },
      m2: {
        available: false,
        health: null,
        metrics: {},
        error: null,
      },
    };

    try {
      const response = await fetchImpl(`${config.m1BaseUrl}/api/bp4/m1/health`);

      next.m1.available = response.ok;
      next.m1.health = await response.json().catch(() => null);
    } catch (error) {
      next.m1.error = error.message;
    }

    try {
      const [healthResponse, metricsResponse] = await Promise.all([
        fetchImpl(`${config.m2BaseUrl}/health`),
        fetchImpl(`${config.m2BaseUrl}/api/bp4/m2/metrics`),
      ]);

      next.m2.available = healthResponse.ok && metricsResponse.ok;
      next.m2.health = await healthResponse.json().catch(() => null);
      next.m2.metrics = parsePrometheus(await metricsResponse.text());
    } catch (error) {
      next.m2.error = error.message;
    }

    snapshot = next;
    logger.debug?.('metrics_aggregated', {
      m1: next.m1.available,
      m2: next.m2.available,
    });

    return next;
  };

  const start = () => {
    clearInterval(timer);
    void poll();
    timer = setInterval(poll, config.metricsIntervalMs);
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    poll,
    start,
    stop,
  });
};
