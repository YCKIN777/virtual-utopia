import assert from 'node:assert/strict';
import test from 'node:test';
import { createMonitor, evaluateAlerts } from '../src/monitoring.js';

test('monitor records metrics and evaluates alert thresholds', () => {
  const monitor = createMonitor();

  monitor.increment('http.requests', 10);
  monitor.increment('http.errors', 2);
  monitor.setGauge('realtime.connections', 120);

  const snapshot = monitor.snapshot();
  const alerts = evaluateAlerts({
    metrics: snapshot,
    thresholds: {
      errorRate: 0.1,
      activeConnections: 100,
    },
  });

  assert.equal(snapshot.counters['http.requests'], 10);
  assert.equal(snapshot.gauges['realtime.connections'], 120);
  assert.deepEqual(
    alerts.map((alert) => alert.code),
    ['HTTP_ERROR_RATE_HIGH', 'REALTIME_CONNECTION_HIGH'],
  );
  assert.match(monitor.prometheus(), /bp4_m2_http\.requests 10/);
});
