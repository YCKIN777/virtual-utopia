import { EventEmitter } from 'node:events';

export const createStructuredLogger = ({
  stream = process.stdout,
  service = 'virtual-utopia-bp4-m2',
} = {}) => {
  const write = (level, event, details = {}) => {
    const record = {
      ts: new Date().toISOString(),
      level,
      service,
      event,
      ...details,
    };

    stream.write(`${JSON.stringify(record)}\n`);
  };

  return Object.freeze({
    debug: (event, details) => write('debug', event, details),
    error: (event, details) => write('error', event, details),
    info: (event, details) => write('info', event, details),
    warn: (event, details) => write('warn', event, details),
  });
};

export const createMonitor = () => {
  const events = new EventEmitter();
  const counters = new Map();
  const gauges = new Map();
  const startedAt = Date.now();

  const increment = (name, value = 1) => {
    const next = (counters.get(name) || 0) + value;

    counters.set(name, next);
    events.emit('metric', {
      type: 'counter',
      name,
      value: next,
    });
    return next;
  };

  const observe = (name, value) => {
    const samples = counters.get(`${name}.samples`) || 0;
    const total = counters.get(`${name}.sum`) || 0;
    const max = Math.max(counters.get(`${name}.max`) || 0, value);

    counters.set(`${name}.samples`, samples + 1);
    counters.set(`${name}.sum`, total + value);
    counters.set(`${name}.max`, max);
  };

  const setGauge = (name, value) => {
    gauges.set(name, Number(value) || 0);
    events.emit('metric', {
      type: 'gauge',
      name,
      value: Number(value) || 0,
    });
  };

  const snapshot = (extra = {}) => {
    const metrics = Object.fromEntries(counters);
    const gaugesSnapshot = Object.fromEntries(gauges);
    const result = {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      counters: metrics,
      gauges: gaugesSnapshot,
      ...extra,
    };

    return result;
  };

  const prometheus = (extra = {}) => {
    const lines = [];
    const data = snapshot(extra);

    Object.entries(data.counters).forEach(([name, value]) => {
      lines.push(`bp4_m2_${name} ${value}`);
    });
    Object.entries(data.gauges).forEach(([name, value]) => {
      lines.push(`bp4_m2_${name} ${value}`);
    });
    lines.push(`bp4_m2_uptime_seconds ${data.uptimeSeconds}`);

    return lines.join('\n') + '\n';
  };

  return Object.freeze({
    events,
    evaluateAlerts: (metrics, thresholds = {}) =>
      evaluateAlerts({ metrics, thresholds }),
    increment,
    observe,
    prometheus,
    setGauge,
    snapshot,
  });
};

export const evaluateAlerts = ({ metrics, thresholds = {} }) => {
  const alerts = [];
  const errorRate =
    metrics.counters['http.requests'] > 0
      ? metrics.counters['http.errors'] / metrics.counters['http.requests']
      : 0;

  if (thresholds.errorRate !== undefined && errorRate > thresholds.errorRate) {
    alerts.push({
      code: 'HTTP_ERROR_RATE_HIGH',
      value: errorRate,
      threshold: thresholds.errorRate,
    });
  }

  if (
    thresholds.activeConnections !== undefined &&
    metrics.gauges['realtime.connections'] > thresholds.activeConnections
  ) {
    alerts.push({
      code: 'REALTIME_CONNECTION_HIGH',
      value: metrics.gauges['realtime.connections'],
      threshold: thresholds.activeConnections,
    });
  }

  if (
    thresholds.sfuUnhealthyWorkers !== undefined &&
    metrics.gauges['sfu.unhealthyWorkers'] > thresholds.sfuUnhealthyWorkers
  ) {
    alerts.push({
      code: 'SFU_WORKER_UNHEALTHY',
      value: metrics.gauges['sfu.unhealthyWorkers'],
      threshold: thresholds.sfuUnhealthyWorkers,
    });
  }

  return alerts;
};
