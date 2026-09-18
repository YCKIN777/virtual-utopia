import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const m4Directory = path.resolve(currentDirectory, '../..');

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

export const readM4Config = (environment = process.env) => ({
  host: environment.BP4_M4_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_M4_PORT, 3561, 1),
  databasePath: path.resolve(
    environment.BP4_M4_DB_PATH ||
      path.join(m4Directory, 'data', 'bp4_m4.sqlite'),
  ),
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  m1BaseUrl: environment.BP4_M4_M1_BASE_URL || 'http://127.0.0.1:3531',
  m2BaseUrl: environment.BP4_M4_M2_BASE_URL || 'http://127.0.0.1:3541',
  metricsIntervalMs: toInteger(
    environment.BP4_M4_METRICS_INTERVAL_MS,
    5000,
    500,
  ),
  requestTimeoutMs: toInteger(environment.BP4_M4_REQUEST_TIMEOUT_MS, 5000, 100),
  allowedOrigins: readList(environment.BP4_M4_ALLOWED_ORIGINS, [
    'http://localhost:5207',
    'http://127.0.0.1:5207',
  ]),
});
