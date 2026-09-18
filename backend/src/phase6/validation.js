import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Phase6ValidationError } from './errors.js';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const safeFileNamePattern = /^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u;
const unsafeContentPattern =
  /<\s*script\b|<\s*iframe\b|javascript\s*:|on[a-z]+\s*=/i;

export const sanitizeFileName = (fileName) => {
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    throw new Phase6ValidationError('file name is required', {
      code: 'PHASE6_UNSAFE_FILE_NAME',
    });
  }

  const normalized = fileName.normalize('NFC').trim();
  const baseName = path.basename(normalized);
  const extension = path.extname(baseName).toLowerCase();
  const stem = baseName.slice(0, -extension.length);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Phase6ValidationError(
      'only .md and .txt documents are supported',
      { code: 'PHASE6_INVALID_FILE_TYPE' },
    );
  }

  if (
    baseName !== normalized ||
    baseName.length > 180 ||
    baseName.startsWith('.') ||
    baseName.includes('..') ||
    /[\\/:*?"<>|\u0000-\u001f]/u.test(baseName) ||
    /[. ]$/u.test(baseName) ||
    !safeFileNamePattern.test(baseName) ||
    WINDOWS_RESERVED_NAMES.has(stem.toUpperCase())
  ) {
    throw new Phase6ValidationError('file name or path is unsafe', {
      code: 'PHASE6_UNSAFE_FILE_NAME',
    });
  }

  return {
    fileName: baseName,
    extension,
    stem,
  };
};

export const validateUploadedFile = ({ file, maxFileSizeBytes }) => {
  if (!file || !Buffer.isBuffer(file.data)) {
    throw new Phase6ValidationError('file field is required');
  }

  if (file.data.length > maxFileSizeBytes) {
    throw new Phase6ValidationError('file exceeds the size limit', {
      code: 'PHASE6_FILE_TOO_LARGE',
      maxFileSizeBytes,
    });
  }

  const identity = sanitizeFileName(file.fileName);
  let content;

  try {
    content = new TextDecoder('utf-8', {
      fatal: true,
    }).decode(file.data);
  } catch {
    throw new Phase6ValidationError('file content must be valid UTF-8');
  }

  if (content.trim() === '') {
    throw new Phase6ValidationError('file content must not be empty');
  }

  if (content.includes('\u0000') || unsafeContentPattern.test(content)) {
    throw new Phase6ValidationError('file content failed the safety check');
  }

  return {
    ...identity,
    content,
  };
};

export const readCollectionName = (value) => {
  if (typeof value !== 'string') {
    throw new Phase6ValidationError('collectionName is required');
  }

  const collectionName = value.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,62}$/.test(collectionName)) {
    throw new Phase6ValidationError('collectionName is invalid');
  }

  return collectionName;
};

export const readOptionalTitle = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Phase6ValidationError('title must be a string');
  }

  const title = value.trim();

  if (title.length > 200) {
    throw new Phase6ValidationError('title must not exceed 200 characters');
  }

  return title || fallback;
};

export const createDocumentIdentity = ({ stem, extension }) => {
  const normalizedStem = stem
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const keyBase = normalizedStem || 'document';
  const id = randomUUID();
  const storedFileName = `${id}${extension}`;

  return {
    documentKey: `${keyBase}-${id.slice(0, 8)}`,
    storedFileName,
  };
};
