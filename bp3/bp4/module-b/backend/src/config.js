import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const moduleDirectory = path.resolve(currentDirectory, '../..');

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

export const readModuleBConfig = (environment = process.env) => ({
  host: environment.BP4_MODULE_B_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_MODULE_B_PORT, 3591, 1),
  databasePath: path.resolve(
    environment.BP4_MODULE_B_DB_PATH ||
      path.join(moduleDirectory, 'data', 'bp4_module_b.sqlite'),
  ),
  moduleABaseUrl:
    environment.BP4_MODULE_B_MODULE_A_BASE_URL || 'http://127.0.0.1:3581',
  ticketSecret:
    environment.BP4_MODULE_B_TICKET_SECRET ||
    environment.BP4_M1_TICKET_SECRET ||
    'bp4-m1-local-ticket-secret',
  ticketTtlSeconds: toInteger(
    environment.BP4_MODULE_B_TICKET_TTL_SECONDS,
    300,
    30,
  ),
  requestTimeoutMs: toInteger(
    environment.BP4_MODULE_B_REQUEST_TIMEOUT_MS,
    4000,
    100,
  ),
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  allowedOrigins: readList(environment.BP4_MODULE_B_ALLOWED_ORIGINS, [
    'http://localhost:5237',
    'http://127.0.0.1:5237',
  ]),
});
