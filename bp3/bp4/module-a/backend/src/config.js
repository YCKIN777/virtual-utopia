import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const moduleDirectory = path.resolve(currentDirectory, '../..');
const bp3Directory = path.resolve(moduleDirectory, '../..');

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

export const readModuleAConfig = (environment = process.env) => ({
  host: environment.BP4_MODULE_A_HOST || '127.0.0.1',
  port: toInteger(environment.BP4_MODULE_A_PORT, 3581, 1),
  databasePath: path.resolve(
    environment.BP4_MODULE_A_DB_PATH ||
      path.join(moduleDirectory, 'data', 'bp4_module_a.sqlite'),
  ),
  bp3DatabasePath: path.resolve(
    environment.BP4_MODULE_A_BP3_DB_PATH ||
      path.join(bp3Directory, 'data', 'virtual_utopia_bp3.sqlite'),
  ),
  ticketSecret:
    environment.BP4_MODULE_A_TICKET_SECRET ||
    environment.BP4_M1_TICKET_SECRET ||
    'bp4-m1-local-ticket-secret',
  ticketTtlSeconds: toInteger(
    environment.BP4_MODULE_A_TICKET_TTL_SECONDS,
    300,
    30,
  ),
  phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
  allowedOrigins: readList(environment.BP4_MODULE_A_ALLOWED_ORIGINS, [
    'http://localhost:5227',
    'http://127.0.0.1:5227',
  ]),
});
