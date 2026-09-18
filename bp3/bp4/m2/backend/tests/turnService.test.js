import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { createTurnService } from '../src/turnService.js';

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

test('TURN service starts, exposes credentials and stops', async () => {
  const port = await getFreePort();
  const service = createTurnService({
    config: {
      listeningPort: port,
      listeningIp: '127.0.0.1',
      relayIp: '127.0.0.1',
      externalIp: '',
      username: 'utopia',
      password: 'secret',
      relayMinPort: 49152,
      relayMaxPort: 49200,
      credentialTtlSeconds: 600,
    },
    logger: {
      info() {},
    },
  });

  await service.start();
  assert.equal(service.healthCheck().running, true);
  assert.equal(service.getIceServers()[1].username, 'utopia');
  await service.stop();
  assert.equal(service.healthCheck().running, false);
});
