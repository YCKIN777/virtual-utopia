import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '../..');

const toInteger = (value, fallback, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
};

export const readPhase5Config = (environment = process.env) => ({
  enabled: toBoolean(environment.PHASE5_ENABLED, false),
  port: toInteger(environment.PHASE5_PORT, 3300, 0),
  databasePath: path.resolve(
    environment.PHASE5_DB_PATH ||
      path.join(backendDirectory, '../data/virtual_utopia_phase5.sqlite'),
  ),
  busyTimeoutMs: toInteger(environment.PHASE5_DB_BUSY_TIMEOUT_MS, 5000, 1),
  authSecret: environment.PHASE5_AUTH_SECRET || '',
  serviceToken: environment.PHASE5_SERVICE_TOKEN || '',
  tokenTtlSeconds: toInteger(environment.PHASE5_TOKEN_TTL_SECONDS, 28800, 60),
  logRetentionDays: toInteger(environment.PHASE5_LOG_RETENTION_DAYS, 90, 1),
  requestTimeoutMs: toInteger(environment.PHASE5_REQUEST_TIMEOUT_MS, 5000, 1),
  bootstrapAdminUsername:
    environment.PHASE5_BOOTSTRAP_ADMIN_USERNAME || 'admin',
  bootstrapAdminPassword: environment.PHASE5_BOOTSTRAP_ADMIN_PASSWORD || '',
  sessionStorageMode: environment.SESSION_STORAGE_MODE || 'memory',
  phase4BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  phase4TimeoutMs: toInteger(environment.PHASE5_TIMEOUT_MS, 3000, 1),
  phase5LogEnabled: toBoolean(environment.PHASE5_LOG_ENABLED, false),
  phase4Port: toInteger(environment.PHASE4_PORT, 3000, 0),
});

export const validatePhase5ServiceConfig = (config) => {
  if (!config.authSecret) {
    throw new Error('PHASE5_AUTH_SECRET is required');
  }

  if (!config.serviceToken) {
    throw new Error('PHASE5_SERVICE_TOKEN is required');
  }

  if (!config.bootstrapAdminPassword) {
    throw new Error('PHASE5_BOOTSTRAP_ADMIN_PASSWORD is required');
  }
};

export const validateSessionStorageMode = (mode) => {
  if (!['memory', 'sqlite'].includes(mode)) {
    throw new Error('SESSION_STORAGE_MODE must be memory or sqlite');
  }

  return mode;
};
