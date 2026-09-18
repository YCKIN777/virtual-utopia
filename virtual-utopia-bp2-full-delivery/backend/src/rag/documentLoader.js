import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ragConfig } from './config.js';
import { RagError, RagNotFoundError, RagValidationError } from './errors.js';

const supportedExtensions = new Set(['.md', '.txt']);

const toPortablePath = (filePath) => filePath.split(path.sep).join('/');

const assertInsideRoot = (filePath, rootDirectory) => {
  const relativePath = path.relative(rootDirectory, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new RagValidationError('document path must stay inside RAG_DOCS_DIR');
  }
};

const collectDocumentFiles = async (targetPath) => {
  const targetStat = await stat(targetPath).catch((error) => {
    if (error.code === 'ENOENT') {
      throw new RagNotFoundError(`document path does not exist: ${targetPath}`);
    }

    throw error;
  });

  if (targetStat.isFile()) {
    if (!supportedExtensions.has(path.extname(targetPath).toLowerCase())) {
      throw new RagValidationError(`unsupported document type: ${targetPath}`);
    }

    return [targetPath];
  }

  if (!targetStat.isDirectory()) {
    throw new RagValidationError(
      `document path is not a file or directory: ${targetPath}`,
    );
  }

  const entries = await readdir(targetPath, {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectDocumentFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      supportedExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(entryPath);
    }
  }

  return files;
};

export const loadDocuments = async ({
  paths,
  rootDirectory = ragConfig.docsDirectory,
}) => {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new RagValidationError('paths must be a non-empty array');
  }

  const resolvedRoot = path.resolve(rootDirectory);
  const files = [];

  for (const requestedPath of paths) {
    if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
      throw new RagValidationError(
        'each document path must be a non-empty string',
      );
    }

    const targetPath = path.resolve(resolvedRoot, requestedPath.trim());
    assertInsideRoot(targetPath, resolvedRoot);
    files.push(...(await collectDocumentFiles(targetPath)));
  }

  const uniqueFiles = [...new Set(files)];
  const documents = [];

  for (const filePath of uniqueFiles) {
    let content;

    try {
      content = await readFile(filePath, 'utf8');
    } catch (error) {
      throw new RagError(`failed to read document: ${filePath}`, {
        code: 'RAG_DOCUMENT_READ_ERROR',
        statusCode: 500,
        cause: error,
      });
    }

    if (content.trim() === '') {
      continue;
    }

    documents.push({
      source: toPortablePath(path.relative(resolvedRoot, filePath)),
      fileName: path.basename(filePath),
      content,
    });
  }

  if (documents.length === 0) {
    throw new RagValidationError(
      'no non-empty .md or .txt documents were found',
    );
  }

  return documents;
};
