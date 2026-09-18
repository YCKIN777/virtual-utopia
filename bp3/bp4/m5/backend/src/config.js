import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const m5Directory = path.resolve(currentDirectory, '../..');
const bp3Directory = path.resolve(m5Directory, '../..');

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

export const readM5Config = (environment = process.env) => ({
  host: environment.BP4_M5_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_M5_PORT, 3571, 1),
  databasePath: path.resolve(
    environment.BP4_M5_DB_PATH ||
      path.join(m5Directory, 'data', 'bp4_m5.sqlite'),
  ),
  bp3DatabasePath: path.resolve(
    environment.BP4_M5_BP3_DB_PATH ||
      path.join(bp3Directory, 'data', 'virtual_utopia_bp3.sqlite'),
  ),
  ticketSecret:
    environment.BP4_M5_TICKET_SECRET ||
    environment.BP4_M1_TICKET_SECRET ||
    'bp4-m1-local-ticket-secret',
  m1BaseUrl: environment.BP4_M5_M1_BASE_URL || 'http://127.0.0.1:3531',
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  requestTimeoutMs: toInteger(environment.BP4_M5_REQUEST_TIMEOUT_MS, 5000, 100),
  allowedOrigins: readList(environment.BP4_M5_ALLOWED_ORIGINS, [
    'http://localhost:5217',
    'http://127.0.0.1:5217',
  ]),
});
