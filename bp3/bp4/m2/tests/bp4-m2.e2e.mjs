import assert from 'node:assert/strict';
import net from 'node:net';
import { WebSocket } from 'ws';
import { startM2Server } from '../backend/src/server.js';
import { readM2Config } from '../backend/src/config.js';

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

const waitForMessage = (socket, predicate, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for M2 message'));
    }, timeoutMs);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };

    socket.on('message', onMessage);
  });

let server;

try {
  const turnPort = await getFreePort();
  const config = {
    ...readM2Config(),
    host: '127.0.0.1',
    port: 0,
    ticketSecret: 'bp4-m2-e2e-secret',
    allowedOrigins: [],
    cluster: {
      ...readM2Config().cluster,
      workers: 2,
      rtcMinPort: 46000,
      rtcMaxPort: 46100,
    },
    turn: {
      ...readM2Config().turn,
      listeningPort: turnPort,
      relayMinPort: 49200,
      relayMaxPort: 49300,
      username: 'e2e',
      password: 'e2e-secret',
    },
  };
  server = await startM2Server({
    config,
    authAdapter: {
      authenticate: async (authorization) => {
        assert.equal(authorization, 'Bearer bp4-m2-e2e-user');

        return {
          id: 8,
          username: 'cluster-user',
          role: 'editor',
        };
      },
    },
  });
  const baseUrl = `http://127.0.0.1:${server.realtime.server.address().port}`;
  const ticketResponse = await fetch(`${baseUrl}/api/bp4/realtime/ticket`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer bp4-m2-e2e-user',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scopes: ['realtime', 'voice'],
      channelIds: ['world-main'],
    }),
  });

  assert.equal(ticketResponse.status, 200);
  const ticket = await ticketResponse.json();
  const socket = new WebSocket(
    `ws://127.0.0.1:${server.realtime.server.address().port}/ws/bp4/realtime?ticket=${encodeURIComponent(
      ticket.ticket,
    )}`,
  );

  await waitForMessage(socket, (message) => message.type === 'ready');
  socket.send(
    JSON.stringify({
      type: 'subscribe',
      channelId: 'world-main',
    }),
  );
  await waitForMessage(socket, (message) => message.type === 'subscribed');
  socket.send(
    JSON.stringify({
      type: 'media.transport.create',
      roomId: 'world-main',
      direction: 'sendrecv',
    }),
  );
  const transport = await waitForMessage(
    socket,
    (message) => message.type === 'media.transport.created',
  );

  assert.ok(transport.transport.id);
  assert.ok(transport.iceServers.length >= 2);
  assert.equal(server.cluster.healthCheck().healthy, true);
  assert.equal(server.turnService.healthCheck().running, true);

  const metrics = await fetch(`${baseUrl}/api/bp4/m2/metrics`);
  assert.equal(metrics.status, 200);
  const metricsText = await metrics.text();
  assert.match(metricsText, /bp4_m2_http\.requests/);

  const backupResponse = await fetch(`${baseUrl}/api/bp4/m2/backups`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer bp4-m2-e2e-user',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dryRun: true,
    }),
  });
  assert.equal(backupResponse.status, 200);
  assert.equal((await backupResponse.json()).status, 'dry-run');

  socket.close();
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        workers: server.cluster.stats().workers.length,
        mediaRooms: server.cluster.stats().rooms,
        turn: server.turnService.healthCheck().listeningPort,
        transportId: transport.transport.id,
        metrics: 'passed',
        backupDryRun: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  await server?.close().catch(() => null);
}
