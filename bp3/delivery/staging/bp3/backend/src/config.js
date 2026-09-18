import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '..');
const rootDirectory = path.resolve(backendDirectory, '..');

const toInteger = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
};

const readList = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const readBp3Config = (environment = process.env) => ({
  host: environment.BP3_HOST || '127.0.0.1',
  port: toInteger(environment.BP3_PORT, 3500, 1),
  databasePath: path.resolve(
    environment.BP3_DB_PATH ||
      path.join(rootDirectory, 'data', 'virtual_utopia_bp3.sqlite'),
  ),
  authSecret: environment.BP3_AUTH_SECRET || 'bp3-local-signing-secret',
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  requestTimeoutMs: toInteger(environment.BP3_REQUEST_TIMEOUT_MS, 4000, 100),
  voiceTokenTtlSeconds: toInteger(
    environment.BP3_VOICE_TOKEN_TTL_SECONDS,
    120,
    30,
  ),
  inviteDefaultTtlSeconds: toInteger(
    environment.BP3_INVITE_TTL_SECONDS,
    86400,
    60,
  ),
  ownerResolutionEnabled: toBoolean(
    environment.BP3_OWNER_RESOLUTION_ENABLED,
    true,
  ),
  mediasoup: {
    workerCount: toInteger(environment.BP3_MEDIASOUP_WORKERS, 1, 1),
    rtcMinPort: toInteger(environment.BP3_MEDIASOUP_RTC_MIN_PORT, 41000, 1),
    rtcMaxPort: toInteger(environment.BP3_MEDIASOUP_RTC_MAX_PORT, 41200, 1),
    listenIp: environment.BP3_MEDIASOUP_LISTEN_IP || '127.0.0.1',
    announcedAddress:
      environment.BP3_MEDIASOUP_ANNOUNCED_ADDRESS ||
      environment.BP3_MEDIASOUP_LISTEN_IP ||
      '127.0.0.1',
  },
  allowedOrigins: readList(environment.BP3_ALLOWED_ORIGINS, [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
  ]),
});

export const validateBp3Config = (config) => {
  if (!config.authSecret) {
    throw new Error('BP3_AUTH_SECRET is required');
  }

  if (config.mediasoup.rtcMinPort > config.mediasoup.rtcMaxPort) {
    throw new Error(
      'BP3_MEDIASOUP_RTC_MIN_PORT cannot exceed BP3_MEDIASOUP_RTC_MAX_PORT',
    );
  }

  return config;
};
