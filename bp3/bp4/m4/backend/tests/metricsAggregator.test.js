import assert from 'node:assert/strict';
import test from 'node:test';
import { createMetricsAggregator } from '../src/metricsAggregator.js';

test('metrics aggregator combines M1 health and M2 metrics', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/api/bp4/m1/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          realtime: { connections: 4 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          cluster: { healthy: true },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response('bp4_m2_http.requests 12\nbp4_m2_uptime_seconds 90\n', {
      status: 200,
    });
  };
  const aggregator = createMetricsAggregator({
    config: {
      m1BaseUrl: 'http://m1',
      m2BaseUrl: 'http://m2',
      metricsIntervalMs: 1000,
    },
    fetchImpl,
    logger: {
      debug() {},
    },
  });
  const snapshot = await aggregator.poll();

  assert.equal(snapshot.m1.available, true);
  assert.equal(snapshot.m2.available, true);
  assert.equal(snapshot.m2.metrics['bp4_m2_http.requests'], 12);
});
