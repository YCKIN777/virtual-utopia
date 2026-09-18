import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Phase6Error } from './errors.js';
import {
  createDocumentIdentity,
  readCollectionName,
  readOptionalTitle,
  validateUploadedFile,
} from './validation.js';

const toPortablePath = (value) => value.split(path.sep).join('/');

const mimeTypeForExtension = (extension) =>
  extension === '.md' ? 'text/markdown' : 'text/plain';

export const createUploadService = ({ config, httpClient }) => {
  const removeFile = (filePath) =>
    rm(filePath, {
      force: true,
    }).catch(() => {});

  const upload = async ({ file, fields, authorization }) => {
    const validated = validateUploadedFile({
      file,
      maxFileSizeBytes: config.maxUploadBytes,
    });
    const collectionName = readCollectionName(fields.collectionName);
    const title = readOptionalTitle(fields.title, validated.stem);
    const identity = createDocumentIdentity(validated);
    const targetPath = path.join(config.docsDirectory, identity.storedFileName);
    const tempPath = `${targetPath}.${randomUUID()}.uploading`;
    const sourcePath = toPortablePath(
      path.relative(config.ragDocsDirectory, targetPath),
    );
    const contentHash = createHash('sha256').update(file.data).digest('hex');

    await mkdir(config.docsDirectory, {
      recursive: true,
    });

    try {
      await writeFile(tempPath, file.data, {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(tempPath, targetPath);
    } catch (error) {
      await removeFile(tempPath);
      await removeFile(targetPath);
      throw new Phase6Error('failed to store uploaded file', {
        code: 'PHASE6_FILE_WRITE_FAILED',
        statusCode: 500,
        cause: error,
      });
    }

    let ingest;

    try {
      ingest = await httpClient.requestJson(
        `${config.ragBaseUrl}/api/rag/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paths: [sourcePath],
            collectionName,
          }),
        },
      );
    } catch (error) {
      await removeFile(targetPath);
      throw new Phase6Error('RAG ingest failed', {
        code: 'PHASE6_RAG_INGEST_FAILED',
        statusCode: 502,
        cause: error,
      });
    }

    let document;

    try {
      document = await httpClient.requestJson(
        `${config.phase5BaseUrl}/api/phase5/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization,
          },
          body: JSON.stringify({
            documentKey: identity.documentKey,
            title,
            sourcePath,
            fileName: validated.fileName,
            mimeType: mimeTypeForExtension(validated.extension),
            contentHash,
            chunkCount: Number(ingest?.chunks) || 0,
            collectionName,
            status: 'indexed',
            metadata: {
              uploadSource: 'phase6',
              storedFileName: identity.storedFileName,
            },
          }),
        },
      );
    } catch (error) {
      await removeFile(targetPath);
      throw new Phase6Error('metadata write failed', {
        code: 'PHASE6_METADATA_WRITE_FAILED',
        statusCode: 502,
        details: {
          vectorCleanup: false,
        },
        cause: error,
      });
    }

    return {
      document,
      ingest,
      storedPath: targetPath,
      sourcePath,
    };
  };

  return Object.freeze({
    upload,
  });
};
