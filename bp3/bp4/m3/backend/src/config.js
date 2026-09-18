import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const m3Directory = path.resolve(currentDirectory, '../..');

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

export const readM3Config = (environment = process.env) => ({
  host: environment.BP4_M3_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_M3_PORT, 3551, 1),
  databasePath: path.resolve(
    environment.BP4_M3_DB_PATH ||
      path.join(m3Directory, 'data', 'bp4_m3.sqlite'),
  ),
  ticketSecret:
    environment.BP4_M3_TICKET_SECRET ||
    environment.BP4_M1_TICKET_SECRET ||
    'bp4-m1-local-ticket-secret',
  m1BaseUrl: environment.BP4_M3_M1_BASE_URL || 'http://127.0.0.1:3531',
  m2BaseUrl: environment.BP4_M3_M2_BASE_URL || 'http://127.0.0.1:3541',
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  pollIntervalMs: toInteger(environment.BP4_M3_POLL_INTERVAL_MS, 5000, 500),
  requestTimeoutMs: toInteger(environment.BP4_M3_REQUEST_TIMEOUT_MS, 5000, 100),
  allowedOrigins: readList(environment.BP4_M3_ALLOWED_ORIGINS, [
    'http://localhost:5197',
    'http://127.0.0.1:5197',
  ]),
});
