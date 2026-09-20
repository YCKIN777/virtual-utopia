import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(currentDirectory, '../..');
const rootDirectory = path.resolve(backendDirectory, '..');

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

const readList = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const readPhase6Config = (environment = process.env) => {
  const ragDocsDirectory = path.resolve(
    environment.RAG_DOCS_DIR || path.join(backendDirectory, 'rag-docs'),
  );

  return {
    enabled: toBoolean(environment.PHASE6_ENABLED, true),
    host: environment.PHASE6_HOST || 'localhost',
    port: toInteger(environment.PHASE6_PORT, 3400, 1),
    phase5BaseUrl: environment.PHASE5_BASE_URL || 'http://localhost:3300',
    ragBaseUrl: environment.RAG_BASE_URL || 'http://localhost:3100',
    serviceToken: environment.PHASE5_SERVICE_TOKEN || '',
    ragDocsDirectory,
    docsDirectory: path.resolve(
      environment.PHASE6_DOCS_DIR || path.join(ragDocsDirectory, 'phase6'),
    ),
    auditDatabasePath: path.resolve(
      environment.PHASE6_AUDIT_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_audit.sqlite'),
    ),
    quotaDatabasePath: path.resolve(
      environment.PHASE6_QUOTA_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_visitor_quota.sqlite'),
    ),
    plotDatabasePath: path.resolve(
      environment.PHASE6_PLOT_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_plot_assignment.sqlite'),
    ),
    cardDatabasePath: path.resolve(
      environment.PHASE6_CARD_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_resident_cards.sqlite'),
    ),
    guestbookDatabasePath: path.resolve(
      environment.PHASE6_GUESTBOOK_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_guestbook.sqlite'),
    ),
    socialDatabasePath: path.resolve(
      environment.PHASE6_SOCIAL_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_resident_social.sqlite'),
    ),
    maxUploadBytes: toInteger(
      environment.PHASE6_MAX_UPLOAD_BYTES,
      10 * 1024 * 1024,
      1,
    ),
    requestTimeoutMs: toInteger(
      environment.PHASE6_REQUEST_TIMEOUT_MS,
      10000,
      1,
    ),
    allowedOrigins: readList(environment.PHASE6_ALLOWED_ORIGINS, [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    ]),
  };
};

export const validatePhase6Config = (config) => {
  if (!config.serviceToken) {
    throw new Error('PHASE5_SERVICE_TOKEN is required');
  }

  const relativeDocsPath = path.relative(
    config.ragDocsDirectory,
    config.docsDirectory,
  );

  if (relativeDocsPath.startsWith('..') || path.isAbsolute(relativeDocsPath)) {
    throw new Error('PHASE6_DOCS_DIR must stay inside RAG_DOCS_DIR');
  }

  return config;
};
