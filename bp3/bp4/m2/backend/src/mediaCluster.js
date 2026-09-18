import * as mediasoup from 'mediasoup';
import { EventEmitter } from 'node:events';

const AUDIO_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

const listenInfos = (config) => [
  {
    protocol: 'udp',
    ip: config.listenIp,
    announcedAddress: config.announcedAddress,
  },
  {
    protocol: 'tcp',
    ip: config.listenIp,
    announcedAddress: config.announcedAddress,
  },
];

export const createMediaCluster = ({ config, logger = console }) => {
  const workers = [];
  const rooms = new Map();
  const events = new EventEmitter();
  const unhealthyPids = new Set();
  let initialized = false;
  let closed = false;

  const workerPortRange = (index) => {
    const total = config.rtcMaxPort - config.rtcMinPort + 1;
    const perWorker = Math.max(2, Math.floor(total / config.workers));
    const min = config.rtcMinPort + index * perWorker;
    const max = Math.min(config.rtcMaxPort, min + perWorker - 1);

    return { min, max };
  };

  const initialize = async () => {
    if (initialized) {
      return;
    }

    for (let index = 0; index < config.workers; index += 1) {
      const range = workerPortRange(index);
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: range.min,
        rtcMaxPort: range.max,
      });

      worker.on('died', (error) => {
        unhealthyPids.add(worker.pid);
        logger.error?.('mediasoup_worker_died', {
          pid: worker.pid,
          message: error?.message || String(error),
        });
        events.emit('worker-died', {
          pid: worker.pid,
          error,
        });
      });
      workers.push({
        worker,
        index,
        rtcMinPort: range.min,
        rtcMaxPort: range.max,
        rooms: 0,
      });
    }

    initialized = true;
  };

  const healthyWorkers = () =>
    workers.filter(
      (entry) => !entry.worker.closed && !unhealthyPids.has(entry.worker.pid),
    );

  const nextWorker = () => {
    const healthy = healthyWorkers();

    if (!healthy.length) {
      throw new Error('No healthy mediasoup workers');
    }

    return healthy.sort((left, right) => left.rooms - right.rooms)[0];
  };

  const createRoom = async (roomId) => {
    await initialize();

    if (rooms.has(roomId)) {
      return rooms.get(roomId);
    }

    const workerEntry = nextWorker();
    const router = await workerEntry.worker.createRouter({
      mediaCodecs: AUDIO_CODECS,
    });
    const room = {
      id: roomId,
      workerEntry,
      router,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      createdAt: new Date().toISOString(),
    };

    workerEntry.rooms += 1;
    rooms.set(roomId, room);
    events.emit('room-created', {
      roomId,
      workerPid: workerEntry.worker.pid,
    });

    return room;
  };

  const createTransport = async (roomId) => {
    const room = await createRoom(roomId);
    const transport = await room.router.createWebRtcTransport({
      listenInfos: listenInfos(config),
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    const record = {
      id: transport.id,
      transport,
    };

    room.transports.set(transport.id, record);
    transport.on('close', () => {
      room.transports.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  };

  const getRoom = (roomId) => rooms.get(roomId) || null;

  const getTransport = (roomId, transportId) =>
    getRoom(roomId)?.transports.get(transportId)?.transport || null;

  const closeRoom = async (roomId) => {
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    room.router.close();
    room.workerEntry.rooms = Math.max(0, room.workerEntry.rooms - 1);
    rooms.delete(roomId);
  };

  const stats = () => ({
    workers: workers.map((entry) => ({
      pid: entry.worker.pid,
      healthy: !entry.worker.closed && !unhealthyPids.has(entry.worker.pid),
      rooms: entry.rooms,
      rtcMinPort: entry.rtcMinPort,
      rtcMaxPort: entry.rtcMaxPort,
    })),
    rooms: rooms.size,
    transports: [...rooms.values()].reduce(
      (total, room) => total + room.transports.size,
      0,
    ),
  });

  const healthCheck = () => {
    const snapshot = stats();

    return {
      healthy:
        snapshot.workers.length === config.workers &&
        snapshot.workers.every((worker) => worker.healthy),
      ...snapshot,
    };
  };

  const close = async () => {
    if (closed) {
      return;
    }

    closed = true;
    rooms.clear();

    await Promise.all(
      workers.map((entry) =>
        entry.worker.closed ? Promise.resolve() : entry.worker.close(),
      ),
    );
    workers.length = 0;
    events.removeAllListeners();
  };

  return Object.freeze({
    close,
    closeRoom,
    createRoom,
    createTransport,
    events,
    getRoom,
    getTransport,
    healthCheck,
    initialize,
    stats,
  });
};
