import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const m1Directory = path.resolve(currentDirectory, '../..');
const bp3Directory = path.resolve(m1Directory, '../..');

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

export const readM1Config = (environment = process.env) => ({
  host: environment.BP4_M1_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_M1_PORT, 3531, 1),
  ticketSecret:
    environment.BP4_M1_TICKET_SECRET || 'bp4-m1-local-ticket-secret',
  ticketTtlSeconds: toInteger(environment.BP4_M1_TICKET_TTL_SECONDS, 300, 30),
  databaseUrl: environment.BP4_DATABASE_URL || '',
  sqlitePath: path.resolve(
    environment.BP4_SQLITE_PATH ||
      path.join(bp3Directory, 'data', 'virtual_utopia_bp3.sqlite'),
  ),
  batchSize: toInteger(environment.BP4_MIGRATION_BATCH_SIZE, 250, 1),
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  requestTimeoutMs: toInteger(environment.BP4_REQUEST_TIMEOUT_MS, 4000, 100),
  allowedOrigins: readList(environment.BP4_ALLOWED_ORIGINS, [
    'http://localhost:5175',
    'http://127.0.0.1:5175',
  ]),
});

export const validateM1Config = (config) => {
  if (!config.ticketSecret) {
    throw new Error('BP4_M1_TICKET_SECRET is required');
  }

  return config;
};
