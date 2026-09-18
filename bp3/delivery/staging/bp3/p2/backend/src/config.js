import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const p2Directory = path.resolve(currentDirectory, '../..');
const bp3Directory = path.resolve(p2Directory, '..');

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

export const readP2Config = (environment = process.env) => ({
  host: environment.BP3_P2_HOST || '127.0.0.1',
  port: toInteger(environment.BP3_P2_PORT, 3521, 1),
  databasePath: path.resolve(
    environment.BP3_DB_PATH ||
      path.join(bp3Directory, 'data', 'virtual_utopia_bp3.sqlite'),
  ),
  authSecret: environment.BP3_AUTH_SECRET || 'bp3-local-signing-secret',
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  requestTimeoutMs: toInteger(environment.BP3_REQUEST_TIMEOUT_MS, 4000, 100),
  messageLimit: toInteger(environment.BP3_P2_MESSAGE_LIMIT, 200, 1),
  allowedOrigins: readList(environment.BP3_ALLOWED_ORIGINS, [
    'http://localhost:5187',
    'http://127.0.0.1:5187',
  ]),
});

export const validateP2Config = (config) => {
  if (!config.authSecret) {
    throw new Error('BP3_AUTH_SECRET is required');
  }

  return config;
};
