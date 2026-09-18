export class Phase6Error extends Error {
  constructor(
    message,
    { code = 'PHASE6_ERROR', statusCode = 500, details, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'Phase6Error';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class Phase6ValidationError extends Phase6Error {
  constructor(message, details) {
    super(message, {
      code: details?.code || 'PHASE6_VALIDATION_ERROR',
      statusCode: 400,
      details,
    });
    this.name = 'Phase6ValidationError';
  }
}

export class Phase6UnauthorizedError extends Phase6Error {
  constructor(message = 'authentication required') {
    super(message, {
      code: 'PHASE6_UNAUTHORIZED',
      statusCode: 401,
    });
    this.name = 'Phase6UnauthorizedError';
  }
}

export class Phase6ForbiddenError extends Phase6Error {
  constructor(message = 'permission denied') {
    super(message, {
      code: 'PHASE6_FORBIDDEN',
      statusCode: 403,
    });
    this.name = 'Phase6ForbiddenError';
  }
}

export class Phase6NotFoundError extends Phase6Error {
  constructor(message = 'resource not found') {
    super(message, {
      code: 'PHASE6_NOT_FOUND',
      statusCode: 404,
    });
    this.name = 'Phase6NotFoundError';
  }
}

export class Phase6UpstreamError extends Phase6Error {
  constructor(message, details) {
    super(message, {
      code: details?.code || 'PHASE6_UPSTREAM_ERROR',
      statusCode: details?.statusCode || 502,
      details,
    });
    this.name = 'Phase6UpstreamError';
  }
}
