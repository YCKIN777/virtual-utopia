import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const m2Directory = path.resolve(currentDirectory, '../..');

const toInteger = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
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

export const readM2Config = (environment = process.env) => ({
  host: environment.BP4_M2_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_M2_PORT, 3541, 1),
  ticketSecret:
    environment.BP4_M2_TICKET_SECRET || 'bp4-m2-local-ticket-secret',
  ticketTtlSeconds: toInteger(environment.BP4_M2_TICKET_TTL_SECONDS, 300, 30),
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  requestTimeoutMs: toInteger(environment.BP4_REQUEST_TIMEOUT_MS, 4000, 100),
  cluster: {
    workers: toInteger(environment.BP4_M2_WORKERS, 2, 1),
    rtcMinPort: toInteger(environment.BP4_M2_RTC_MIN_PORT, 44000, 1),
    rtcMaxPort: toInteger(environment.BP4_M2_RTC_MAX_PORT, 44200, 1),
    listenIp: environment.BP4_M2_LISTEN_IP || '127.0.0.1',
    announcedAddress:
      environment.BP4_M2_ANNOUNCED_ADDRESS ||
      environment.BP4_M2_LISTEN_IP ||
      '127.0.0.1',
  },
  turn: {
    listeningPort: toInteger(environment.BP4_M2_TURN_PORT, 3478, 1),
    listeningIp:
      environment.BP4_M2_TURN_LISTEN_IP ||
      environment.BP4_M2_ANNOUNCED_ADDRESS ||
      '127.0.0.1',
    relayIp:
      environment.BP4_M2_TURN_RELAY_IP ||
      environment.BP4_M2_ANNOUNCED_ADDRESS ||
      '127.0.0.1',
    externalIp: environment.BP4_M2_TURN_EXTERNAL_IP || '',
    username: environment.BP4_M2_TURN_USERNAME || 'utopia',
    password: environment.BP4_M2_TURN_PASSWORD || 'utopia-local-turn-password',
    relayMinPort: toInteger(environment.BP4_M2_TURN_RELAY_MIN_PORT, 49152, 1),
    relayMaxPort: toInteger(environment.BP4_M2_TURN_RELAY_MAX_PORT, 65535, 1),
    credentialTtlSeconds: toInteger(
      environment.BP4_M2_TURN_CREDENTIAL_TTL_SECONDS,
      3600,
      60,
    ),
  },
  databaseUrl: environment.BP4_DATABASE_URL || '',
  backupDirectory: path.resolve(
    environment.BP4_BACKUP_DIR || path.join(m2Directory, 'backups'),
  ),
  alertWebhookUrl: environment.BP4_ALERT_WEBHOOK_URL || '',
  allowedOrigins: readList(environment.BP4_ALLOWED_ORIGINS, [
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5187',
    'http://127.0.0.1:5187',
  ]),
});

export const validateM2Config = (config) => {
  if (!config.ticketSecret) {
    throw new Error('BP4_M2_TICKET_SECRET is required');
  }

  if (config.cluster.rtcMinPort > config.cluster.rtcMaxPort) {
    throw new Error('BP4_M2 RTC min port cannot exceed max port');
  }

  if (config.turn.relayMinPort > config.turn.relayMaxPort) {
    throw new Error('BP4_M2 TURN relay min port cannot exceed max port');
  }

  return config;
};
