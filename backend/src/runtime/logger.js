/**
 * 结构化日志器（无外部依赖，独立于冻结代码）。
 *
 * 用法：
 *   import { createLogger, logger } from './runtime/logger.js';
 *   const log = createLogger({ service: 'phase5' });
 *   log.info('started', { port: 3300 });
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

export const createLogger = ({
  service = 'virtual-utopia',
  level = 'info',
} = {}) => {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const write = (lvl, msg, meta) => {
    if ((LEVELS[lvl] ?? LEVELS.info) > threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      service,
      level: lvl,
      msg,
      ...(meta && typeof meta === 'object' ? meta : { detail: meta }),
    };
    const line = JSON.stringify(entry);
    if (lvl === 'error' || lvl === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    error: (msg, meta) => write('error', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    debug: (msg, meta) => write('debug', msg, meta),
  };
};

export const logger = createLogger();
