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

export const createMediasoupAdapter = ({ config, logger = console }) => {
  const workers = [];
  const rooms = new Map();
  const events = new EventEmitter();
  let nextWorkerIndex = 0;
  let initialized = false;
  let closed = false;

  const nextWorker = () => {
    const worker = workers[nextWorkerIndex];
    nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;

    return worker;
  };

  const initialize = async () => {
    if (initialized) {
      return;
    }

    for (let index = 0; index < config.workerCount; index += 1) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: config.rtcMinPort,
        rtcMaxPort: config.rtcMaxPort,
      });

      worker.on('died', (error) => {
        logger.error(
          JSON.stringify({
            service: 'virtual-utopia-bp3',
            event: 'mediasoup_worker_died',
            pid: worker.pid,
            message: error?.message || String(error),
          }),
        );
        events.emit('worker-died', {
          pid: worker.pid,
          error,
        });
      });
      workers.push(worker);
    }

    initialized = true;
  };

  const createRoom = async (roomId) => {
    await initialize();

    if (rooms.has(roomId)) {
      return rooms.get(roomId);
    }

    const worker = nextWorker();
    const router = await worker.createRouter({
      mediaCodecs: AUDIO_CODECS,
    });
    const audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 10,
      threshold: -70,
      interval: 600,
    });
    const room = {
      id: roomId,
      worker,
      router,
      audioLevelObserver,
      participants: new Map(),
      createdAt: new Date().toISOString(),
    };

    audioLevelObserver.on('volumes', (volumes) => {
      events.emit('audio-level', {
        roomId,
        volumes,
      });
    });
    audioLevelObserver.on('silence', () => {
      events.emit('audio-silence', { roomId });
    });
    rooms.set(roomId, room);

    return room;
  };

  const createTransport = async (room) => {
    const transport = await room.router.createWebRtcTransport({
      listenInfos: listenInfos(config),
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    return transport;
  };

  const serializeTransport = (transport) => ({
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
  });

  const closeRoom = async (roomId) => {
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    rooms.delete(roomId);
    room.router.close();
  };

  const close = async () => {
    if (closed) {
      return;
    }

    closed = true;
    rooms.clear();

    await Promise.all(
      workers.map((worker) =>
        worker.closed ? Promise.resolve() : worker.close(),
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
    getRoom(roomId) {
      return rooms.get(roomId) || null;
    },
    initialize,
    serializeTransport,
    workerCount() {
      return workers.length;
    },
  });
};
