import { Phase6ValidationError } from './errors.js';

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');
const DOUBLE_DASH = Buffer.from('--');
const MAX_HEADER_BYTES = 16 * 1024;

const readBoundary = (contentType = '') => {
  const match = contentType.match(
    /multipart\/form-data;\s*boundary="?([^";]+)"?/i,
  );

  if (!match || !match[1] || match[1].length > 70) {
    throw new Phase6ValidationError('multipart boundary is missing or invalid');
  }

  return match[1];
};

const parseHeaders = (buffer) => {
  const lines = buffer.toString('utf8').split('\r\n');
  const headers = Object.create(null);

  for (const line of lines) {
    const separator = line.indexOf(':');

    if (separator <= 0) {
      continue;
    }

    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = value;
  }

  return headers;
};

const parseDisposition = (value = '') => {
  const name = value.match(/(?:^|;\s*)name="([^"]*)"/i)?.[1];
  const fileName = value.match(/(?:^|;\s*)filename="([^"]*)"/i)?.[1];

  return {
    name,
    fileName,
  };
};

export const parseMultipart = (body, contentType) => {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new Phase6ValidationError('multipart request body is required');
  }

  const boundary = readBoundary(contentType);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const delimiter = Buffer.concat([CRLF, boundaryBuffer]);
  const fields = Object.create(null);
  const files = [];
  let cursor = body.indexOf(boundaryBuffer);

  if (cursor === -1) {
    throw new Phase6ValidationError('multipart boundary was not found');
  }

  while (cursor !== -1) {
    let partStart = cursor + boundaryBuffer.length;

    if (body.subarray(partStart, partStart + 2).equals(DOUBLE_DASH)) {
      break;
    }

    if (body.subarray(partStart, partStart + 2).equals(CRLF)) {
      partStart += 2;
    }

    const headerEnd = body.indexOf(HEADER_END, partStart);

    if (headerEnd === -1) {
      throw new Phase6ValidationError('multipart part headers are incomplete');
    }

    if (headerEnd - partStart > MAX_HEADER_BYTES) {
      throw new Phase6ValidationError('multipart part headers are too large');
    }

    const headers = parseHeaders(body.subarray(partStart, headerEnd));
    const disposition = parseDisposition(headers['content-disposition']);
    const contentStart = headerEnd + HEADER_END.length;
    const nextBoundary = body.indexOf(delimiter, contentStart);

    if (!disposition.name || nextBoundary === -1) {
      throw new Phase6ValidationError('multipart part is malformed');
    }

    const content = body.subarray(contentStart, nextBoundary);

    if (disposition.fileName !== undefined) {
      files.push({
        fieldName: disposition.name,
        fileName: disposition.fileName,
        contentType: headers['content-type'] || 'application/octet-stream',
        data: content,
      });
    } else {
      fields[disposition.name] = content.toString('utf8');
    }

    cursor = body.indexOf(boundaryBuffer, nextBoundary);
  }

  return {
    fields,
    files,
  };
};
