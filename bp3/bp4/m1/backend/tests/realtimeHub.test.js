import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealtimeHub } from '../src/realtimeHub.js';
import { createTicketService } from '../src/ticketService.js';

const createSocket = () => ({
  readyState: 1,
  messages: [],
  send(payload) {
    this.messages.push(JSON.parse(payload));
  },
});

test('realtime hub broadcasts ordered events and supports resume', () => {
  const hub = createRealtimeHub();
  const firstSocket = createSocket();
  const secondSocket = createSocket();
  const first = hub.registerConnection({
    user: { id: 1, username: 'one' },
    channelIds: ['world-main'],
    socket: firstSocket,
  });
  const second = hub.registerConnection({
    user: { id: 2, username: 'two' },
    channelIds: ['world-main'],
    socket: secondSocket,
  });

  hub.subscribe(first.connectionId, 'world-main');
  hub.subscribe(second.connectionId, 'world-main');

  const event = hub.publish({
    channelId: 'world-main',
    type: 'avatar.state.updated',
    actorUserId: 1,
    data: { actionId: 'wave' },
  });

  assert.equal(event.sequence, 1);
  assert.equal(firstSocket.messages.length, 1);
  assert.equal(secondSocket.messages.length, 1);
  assert.deepEqual(
    hub.resume(first.connectionId, 'world-main', 0).map((item) => item.id),
    [event.id],
  );

  hub.acknowledge(first.connectionId, event.id);
  assert.equal(
    hub.getConnection(first.connectionId).acknowledged.has(event.id),
    true,
  );
});

test('realtime hub rejects events outside ticket channels', () => {
  const hub = createRealtimeHub();
  const connection = hub.registerConnection({
    user: { id: 1, username: 'one' },
    channelIds: ['world-main'],
  });

  assert.throws(() => hub.subscribe(connection.connectionId, 'private-room'), {
    code: 'BP4_FORBIDDEN',
  });
});

test('ticket service signs, verifies and rejects tampering', () => {
  const service = createTicketService({
    secret: 'test-secret',
    ttlSeconds: 60,
  });
  const result = service.createTicket({
    user: {
      id: 9,
      username: 'test',
      role: 'editor',
    },
  });
  const claims = service.verifyTicket(result.ticket);

  assert.equal(claims.sub, 9);
  assert.equal(claims.role, 'editor');
  assert.throws(() => service.verifyTicket(`${result.ticket}x`), {
    code: 'BP4_UNAUTHORIZED',
  });
});
