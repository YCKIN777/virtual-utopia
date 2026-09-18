import { ragConfig } from './config.js';
import { RagValidationError } from './errors.js';

const boundarySeparators = ['\n\n', '\n', '。', '！', '？', '. ', ' '];

const findBoundary = (text, start, end) => {
  const minimumBoundary = start + Math.floor((end - start) * 0.6);
  let bestBoundary = -1;

  for (const separator of boundarySeparators) {
    const candidate = text.lastIndexOf(separator, end);

    if (candidate >= minimumBoundary && candidate > bestBoundary) {
      bestBoundary = candidate + separator.length;
    }
  }

  return bestBoundary > start ? bestBoundary : end;
};

export const normalizeText = (text) => text.replace(/\r\n?/g, '\n').trim();

export const chunkText = (
  text,
  {
    chunkSize = ragConfig.chunkSize,
    chunkOverlap = ragConfig.chunkOverlap,
  } = {},
) => {
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize <= 0 ||
    !Number.isInteger(chunkOverlap) ||
    chunkOverlap < 0 ||
    chunkOverlap >= chunkSize
  ) {
    throw new RagValidationError('chunkSize and chunkOverlap are invalid');
  }

  const normalizedText = normalizeText(text);

  if (normalizedText === '') {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < normalizedText.length) {
    const maximumEnd = Math.min(start + chunkSize, normalizedText.length);
    const end =
      maximumEnd === normalizedText.length
        ? maximumEnd
        : findBoundary(normalizedText, start, maximumEnd);
    const chunk = normalizedText.slice(start, end).trim();

    if (chunk !== '') {
      chunks.push({
        index: chunks.length,
        text: chunk,
      });
    }

    if (end >= normalizedText.length) {
      break;
    }

    let nextStart = Math.max(end - chunkOverlap, start + 1);

    while (
      nextStart < normalizedText.length &&
      /\s/.test(normalizedText[nextStart])
    ) {
      nextStart += 1;
    }

    start = nextStart;
  }

  return chunks;
};
