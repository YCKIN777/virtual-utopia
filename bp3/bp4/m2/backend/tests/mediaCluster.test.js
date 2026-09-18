import assert from 'node:assert/strict';
import test from 'node:test';
import { createMediaCluster } from '../src/mediaCluster.js';

test('media cluster creates rooms and transports across workers', async () => {
  const cluster = createMediaCluster({
    config: {
      workers: 2,
      rtcMinPort: 45000,
      rtcMaxPort: 45099,
      listenIp: '127.0.0.1',
      announcedAddress: '127.0.0.1',
    },
    logger: {
      error() {},
    },
  });

  try {
    await cluster.initialize();
    const first = await cluster.createTransport('world-main');
    const second = await cluster.createTransport('world-secondary');
    const stats = cluster.stats();

    assert.equal(stats.workers.length, 2);
    assert.equal(stats.rooms, 2);
    assert.equal(stats.transports, 2);
    assert.ok(first.id);
    assert.ok(second.id);
    assert.equal(cluster.healthCheck().healthy, true);
  } finally {
    await cluster.close();
  }
});
