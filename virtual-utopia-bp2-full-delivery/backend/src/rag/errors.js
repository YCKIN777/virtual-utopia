export class RagError extends Error {
  constructor(message, { code = 'RAG_ERROR', statusCode = 500, cause } = {}) {
    super(message, { cause });
    this.name = 'RagError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class RagValidationError extends RagError {
  constructor(message) {
    super(message, {
      code: 'RAG_VALIDATION_ERROR',
      statusCode: 400,
    });
    this.name = 'RagValidationError';
  }
}

export class RagNotFoundError extends RagError {
  constructor(message) {
    super(message, {
      code: 'RAG_NOT_FOUND',
      statusCode: 404,
    });
    this.name = 'RagNotFoundError';
  }
}
