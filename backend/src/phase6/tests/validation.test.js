import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readCollectionName,
  sanitizeFileName,
  validateUploadedFile,
} from '../validation.js';

test('accepts safe Markdown and text file names', () => {
  assert.deepEqual(sanitizeFileName('资源墙-规则.md'), {
    fileName: '资源墙-规则.md',
    extension: '.md',
    stem: '资源墙-规则',
  });
});

test('rejects path traversal and unsupported extensions', () => {
  assert.throws(() => sanitizeFileName('../guide.md'), {
    code: 'PHASE6_UNSAFE_FILE_NAME',
  });
  assert.throws(() => sanitizeFileName('guide.exe'), {
    code: 'PHASE6_INVALID_FILE_TYPE',
  });
});

test('rejects oversized, invalid, and script-like uploads', () => {
  assert.throws(
    () =>
      validateUploadedFile({
        file: {
          fileName: 'guide.md',
          data: Buffer.alloc(11),
        },
        maxFileSizeBytes: 10,
      }),
    {
      code: 'PHASE6_FILE_TOO_LARGE',
    },
  );

  assert.throws(
    () =>
      validateUploadedFile({
        file: {
          fileName: 'guide.md',
          data: Buffer.from('<script>alert(1)</script>'),
        },
        maxFileSizeBytes: 1024,
      }),
    {
      code: 'PHASE6_VALIDATION_ERROR',
    },
  );

  assert.throws(
    () =>
      validateUploadedFile({
        file: {
          fileName: 'guide.md',
          data: Buffer.from([0xff, 0xfe, 0xfd]),
        },
        maxFileSizeBytes: 1024,
      }),
    {
      code: 'PHASE6_VALIDATION_ERROR',
    },
  );
});

test('validates collection names', () => {
  assert.equal(readCollectionName('virtual_utopia_rag'), 'virtual_utopia_rag');
  assert.throws(() => readCollectionName('../unsafe'), {
    code: 'PHASE6_VALIDATION_ERROR',
  });
});
