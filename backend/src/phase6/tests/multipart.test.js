import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMultipart } from '../multipart.js';

const createMultipartBody = () => {
  const boundary = 'phase6-boundary';
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="collectionName"',
      '',
      'virtual_utopia_rag',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="guide.md"',
      'Content-Type: text/markdown',
      '',
      '# 指南',
      `--${boundary}--`,
      '',
    ].join('\r\n'),
  );

  return {
    boundary,
    body,
  };
};

test('parses multipart fields and file content', () => {
  const { boundary, body } = createMultipartBody();
  const parsed = parseMultipart(
    body,
    `multipart/form-data; boundary=${boundary}`,
  );

  assert.equal(parsed.fields.collectionName, 'virtual_utopia_rag');
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].fieldName, 'file');
  assert.equal(parsed.files[0].fileName, 'guide.md');
  assert.equal(parsed.files[0].contentType, 'text/markdown');
  assert.equal(parsed.files[0].data.toString('utf8'), '# 指南');
});

test('rejects multipart bodies with an invalid boundary', () => {
  assert.throws(
    () =>
      parseMultipart(
        Buffer.from('not multipart'),
        'multipart/form-data; boundary=missing',
      ),
    {
      code: 'PHASE6_VALIDATION_ERROR',
    },
  );
});
