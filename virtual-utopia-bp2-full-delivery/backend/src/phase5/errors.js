export class Phase5Error extends Error {
  constructor(
    message,
    { code = 'PHASE5_ERROR', statusCode = 500, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'Phase5Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class Phase5ValidationError extends Phase5Error {
  constructor(message) {
    super(message, {
      code: 'PHASE5_VALIDATION_ERROR',
      statusCode: 400,
    });
    this.name = 'Phase5ValidationError';
  }
}

export class Phase5NotFoundError extends Phase5Error {
  constructor(message) {
    super(message, {
      code: 'PHASE5_NOT_FOUND',
      statusCode: 404,
    });
    this.name = 'Phase5NotFoundError';
  }
}

export class Phase5UnauthorizedError extends Phase5Error {
  constructor(message = 'authentication required') {
    super(message, {
      code: 'PHASE5_UNAUTHORIZED',
      statusCode: 401,
    });
    this.name = 'Phase5UnauthorizedError';
  }
}

export class Phase5ForbiddenError extends Phase5Error {
  constructor(message = 'permission denied') {
    super(message, {
      code: 'PHASE5_FORBIDDEN',
      statusCode: 403,
    });
    this.name = 'Phase5ForbiddenError';
  }
}
