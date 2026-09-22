import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** 确保目录存在 */
export const ensureDirectory = (directory) => {
  mkdirSync(directory, { recursive: true });
  return directory;
};

/** 读取 JSON，失败/缺失时返回 fallback（绝不抛错，避免拖垮请求） */
export const readJson = (filePath, fallback = null) => {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    const raw = readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/** 原子写：先写临时文件再 rename，避免进程中断留下半截文件 */
export const writeJson = (filePath, value) => {
  ensureDirectory(path.dirname(filePath));
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporary, filePath);
  return filePath;
};

export const removeFile = (filePath) => {
  try {
    if (existsSync(filePath)) {
      rmSync(filePath);
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

export const listJsonFiles = (directory) => {
  try {
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
};

export const listDirectories = (directory) => {
  try {
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory).filter((name) => {
      try {
        return statSync(path.join(directory, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};

/** 文件路径安全片段：只保留字母数字下划线连字符 */
export const safeSegment = (value) =>
  String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64) || 'unknown';

export const relativeTo = (base, target) =>
  path.relative(base, target).split(path.sep).join('/');
