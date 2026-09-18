import { Device } from 'mediasoup-client';

const waitFor = (predicate, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const result = predicate();

      if (result) {
        clearInterval(timer);
        resolve(result);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Voice operation timed out'));
      }
    }, 25);
  });

const makeWebSocketUrl = (token) => {
  const url = new URL('/ws/bp3/voice/signaling', globalThis.location.href);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);

  return url.toString();
};

export const createVoiceClient = ({
  api,
  channelId = 'world-main',
  onState = () => {},
  onError = () => {},
} = {}) => {
  let socket = null;
  let device = null;
  let transport = null;
  let recvTransport = null;
  let localTrack = null;
  let localProducer = null;
  let started = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let connectionToken = '';
  const consumers = new Map();
  const producers = new Set();
  const pending = new Map();
  const audioElements = new Map();

  const state = {
    status: 'idle',
    muted: false,
    participants: [],
    remoteAudioCount: 0,
    error: null,
  };

  const publish = (patch = {}) => {
    Object.assign(state, patch);
    onState({ ...state });
  };

  const send = (payload) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Voice signaling is not connected');
    }

    socket.send(JSON.stringify(payload));
  };

  const request = (payload, expectedType, key = 'id') =>
    new Promise((resolve, reject) => {
      const requestId = `${expectedType}-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Voice signaling request timed out'));
      }, 10000);

      pending.set(requestId, {
        expectedType,
        key,
        resolve,
        reject,
        timeout,
      });
      send({
        ...payload,
        requestId,
      });
    });

  const resolvePending = (message) => {
    for (const [requestId, entry] of pending) {
      if (message.type !== entry.expectedType) {
        continue;
      }

      const expectedValue = entry.request?.[entry.key];

      if (expectedValue !== undefined && message[entry.key] !== expectedValue) {
        continue;
      }

      clearTimeout(entry.timeout);
      pending.delete(requestId);
      entry.resolve(message);
      return true;
    }

    return false;
  };

  const attachRemoteTrack = (consumer) => {
    if (!consumer.track || consumer.kind !== 'audio') {
      return;
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = new MediaStream([consumer.track]);
    audioElements.set(consumer.id, audio);
    void audio.play().catch(() => null);
  };

  const consumeProducer = async ({ producerId, userId }) => {
    if (producers.has(producerId)) {
      return;
    }

    try {
      const responsePromise = new Promise((resolve, reject) => {
        const requestId = `consume-${producerId}`;
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('Consumer negotiation timed out'));
        }, 10000);

        pending.set(requestId, {
          expectedType: 'consumed',
          key: 'producerId',
          request: { producerId },
          resolve,
          reject,
          timeout,
        });
      });

      send({
        type: 'consume',
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });
      const message = await responsePromise;
      const consumer = await recvTransport.consume({
        id: message.consumerId,
        producerId: message.producerId,
        kind: message.kind,
        rtpParameters: message.rtpParameters,
      });

      consumers.set(consumer.id, consumer);
      producers.add(producerId);
      attachRemoteTrack(consumer);
      publish({
        remoteAudioCount: consumers.size,
        participants: state.participants.map((participant) =>
          participant.userId === userId
            ? { ...participant, connected: true }
            : participant,
        ),
      });
    } catch (error) {
      onError(error);
    }
  };

  const handleMessage = async (message) => {
    if (!message || typeof message.type !== 'string') {
      return;
    }

    if (resolvePending(message)) {
      return;
    }

    if (message.type === 'ready') {
      device = new Device();
      await device.load({
        routerRtpCapabilities: message.rtpCapabilities,
      });
      transport = device.createSendTransport(message.transport);
      recvTransport = device.createRecvTransport(message.recvTransport);
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        send({
          type: 'connect-transport',
          transportId: transport.id,
          dtlsParameters,
        });
        callback();
        errback;
      });
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        send({
          type: 'connect-transport',
          transportId: recvTransport.id,
          dtlsParameters,
        });
        callback();
        errback;
      });
      transport.on(
        'produce',
        ({ kind, rtpParameters, appData }, callback, errback) => {
          const requestId = `produce-${Date.now()}`;

          pending.set(requestId, {
            expectedType: 'produced',
            key: 'id',
            request: {},
            resolve: (produced) => callback({ id: produced.id }),
            reject: errback,
            timeout: setTimeout(() => {
              pending.delete(requestId);
              errback(new Error('Produce negotiation timed out'));
            }, 10000),
          });
          send({
            type: 'produce',
            kind,
            rtpParameters,
            appData,
          });
        },
      );

      publish({
        status: 'connected',
        participants: message.participants || [],
        error: null,
      });
      reconnectAttempts = 0;

      for (const producer of message.existingProducers || []) {
        void consumeProducer(producer);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      localTrack = stream.getAudioTracks()[0] || null;

      if (!localTrack) {
        throw new Error('No microphone track was found');
      }

      localProducer = await transport.produce({
        track: localTrack,
        codecOptions: {
          opusStereo: false,
          opusDtx: true,
        },
      });
      publish({
        muted: false,
      });
      return;
    }

    if (message.type === 'new-producer') {
      void consumeProducer(message);
      return;
    }

    if (message.type === 'participant.joined') {
      publish({
        participants: [
          ...state.participants.filter(
            (participant) => participant.userId !== message.participant.userId,
          ),
          message.participant,
        ],
      });
      return;
    }

    if (message.type === 'participant.left') {
      publish({
        participants: state.participants.filter(
          (participant) => participant.userId !== message.userId,
        ),
      });
      return;
    }

    if (message.type === 'participant.updated') {
      publish({
        participants: state.participants.map((participant) =>
          participant.userId === message.participant.userId
            ? {
                ...participant,
                ...message.participant,
              }
            : participant,
        ),
      });
      return;
    }

    if (message.type === 'moderation.kicked') {
      publish({
        status: 'kicked',
        error: message.reason || '您已被移出语音频道',
      });
      return;
    }

    if (message.type === 'error') {
      onError(new Error(message.message));
    }
  };

  const connect = async () => {
    if (!started) {
      return;
    }

    publish({
      status: reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      error: null,
    });

    try {
      transport?.close();
      recvTransport?.close();
      consumers.forEach((consumer) => consumer.close());
      consumers.clear();
      producers.clear();
      transport = null;
      recvTransport = null;

      const joined = await api.joinVoice(channelId);

      connectionToken = joined.token;
      socket = new WebSocket(makeWebSocketUrl(connectionToken));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        void handleMessage(message).catch(onError);
      };
      socket.onerror = () => {
        onError(new Error('语音信令连接失败'));
      };
      socket.onclose = () => {
        if (!started || state.status === 'kicked') {
          return;
        }

        reconnectAttempts += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);

        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          void connect();
        }, delay);
      };
    } catch (error) {
      onError(error);
      throw error;
    }
  };

  const start = async () => {
    if (started) {
      return;
    }

    started = true;
    await connect();
    await waitFor(() => state.status === 'connected', 12000);
  };

  const stop = async () => {
    started = false;
    clearTimeout(reconnectTimer);

    if (socket?.readyState === WebSocket.OPEN) {
      try {
        send({ type: 'leave' });
      } catch {
        // The socket may already be closing.
      }
    }

    localProducer?.close();
    localTrack?.stop();
    consumers.forEach((consumer) => consumer.close());
    audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    consumers.clear();
    audioElements.clear();
    producers.clear();
    transport?.close();
    recvTransport?.close();
    socket?.close();
    socket = null;
    device = null;
    transport = null;
    recvTransport = null;
    localProducer = null;
    localTrack = null;
    publish({
      status: 'idle',
      participants: [],
      remoteAudioCount: 0,
    });
    await api.leaveVoice(channelId).catch(() => null);
  };

  const setMuted = async (muted) => {
    if (!localProducer) {
      return;
    }

    if (muted) {
      localProducer.pause();
    } else {
      localProducer.resume();
    }

    publish({ muted });
    send({
      type: 'set-muted',
      muted,
    });
    await api.muteVoice(channelId, muted);
  };

  return Object.freeze({
    get state() {
      return { ...state };
    },
    setMuted,
    start,
    stop,
  });
};
