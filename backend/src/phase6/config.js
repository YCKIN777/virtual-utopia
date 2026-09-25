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
    homeSocialDatabasePath: path.resolve(
      environment.PHASE6_HOME_SOCIAL_DB_PATH ||
        path.join(rootDirectory, 'data', 'phase6_home_social.sqlite'),
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
      'http://localhost:5199',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
      'http://127.0.0.1:5199',
    ]),
    // 浏览器请求一定携带 Origin，而开发端口经常变动（vite 配置写 5175，实际可跑 5199）。
    // 这里默认额外放行本机回环来源（localhost / 127.0.0.1 / [::1] 的任意端口），
    // 避免出现「curl 能登录、浏览器却 403 origin is not allowed」。
    // 生产环境可用 PHASE6_ALLOW_LOOPBACK_ORIGINS=false 关闭该放宽。
    allowLoopbackOrigins:
      environment.PHASE6_ALLOW_LOOPBACK_ORIGINS !== 'false',
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
