import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createUploadService } from '../uploadService.js';

const createConfig = (rootDirectory) => ({
  phase5BaseUrl: 'http://phase5.test',
  ragBaseUrl: 'http://rag.test',
  ragDocsDirectory: path.join(rootDirectory, 'rag-docs'),
  docsDirectory: path.join(rootDirectory, 'rag-docs', 'phase6'),
  maxUploadBytes: 1024,
});

const createFile = () => ({
  fieldName: 'file',
  fileName: 'guide.md',
  contentType: 'text/markdown',
  data: Buffer.from('# Guide', 'utf8'),
});

test('stores a safe upload and writes Phase5 metadata', async (context) => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'phase6-upload-'));
  const calls = [];
  const service = createUploadService({
    config: createConfig(rootDirectory),
    httpClient: {
      async requestJson(url, options) {
        calls.push({
          url,
          options,
        });

        if (url.includes('/api/rag/ingest')) {
          return {
            documents: 1,
            chunks: 2,
            ids: ['a', 'b'],
          };
        }

        return {
          id: 9,
          title: 'Guide',
          collectionName: 'virtual_utopia_rag',
        };
      },
    },
  });

  context.after(() =>
    rm(rootDirectory, {
      recursive: true,
      force: true,
    }),
  );

  const result = await service.upload({
    file: createFile(),
    fields: {
      collectionName: 'virtual_utopia_rag',
      title: 'Guide',
    },
    authorization: 'Bearer token',
  });

  assert.equal(result.document.id, 9);
  assert.match(result.sourcePath, /^phase6\/.+\.md$/);
  assert.equal(await readFile(result.storedPath, 'utf8'), '# Guide');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://rag.test/api/rag/ingest');

  const metadata = JSON.parse(calls[1].options.body);
  assert.equal(metadata.chunkCount, 2);
  assert.equal(metadata.status, 'indexed');
  assert.equal(metadata.metadata.uploadSource, 'phase6');
});

test('removes the stored file when RAG ingest fails', async (context) => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'phase6-upload-'));
  const service = createUploadService({
    config: createConfig(rootDirectory),
    httpClient: {
      async requestJson() {
        throw new Error('rag unavailable');
      },
    },
  });

  context.after(() =>
    rm(rootDirectory, {
      recursive: true,
      force: true,
    }),
  );

  await assert.rejects(
    service.upload({
      file: createFile(),
      fields: {
        collectionName: 'virtual_utopia_rag',
      },
      authorization: 'Bearer token',
    }),
    {
      code: 'PHASE6_RAG_INGEST_FAILED',
    },
  );
});
