export class Bp3Error extends Error {
  constructor(
    message,
    { code = 'BP3_ERROR', status = 500, details = null, cause } = {},
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class Bp3UnauthorizedError extends Bp3Error {
  constructor(message = 'Authentication is required') {
    super(message, {
      code: 'BP3_UNAUTHORIZED',
      status: 401,
    });
  }
}

export class Bp3ForbiddenError extends Bp3Error {
  constructor(message = 'Operation is forbidden') {
    super(message, {
      code: 'BP3_FORBIDDEN',
      status: 403,
    });
  }
}

export class Bp3NotFoundError extends Bp3Error {
  constructor(message = 'Resource not found') {
    super(message, {
      code: 'BP3_NOT_FOUND',
      status: 404,
    });
  }
}

export class Bp3ConflictError extends Bp3Error {
  constructor(message = 'Resource conflict') {
    super(message, {
      code: 'BP3_CONFLICT',
      status: 409,
    });
  }
}

export class Bp3ValidationError extends Bp3Error {
  constructor(message = 'Invalid request') {
    super(message, {
      code: 'BP3_VALIDATION_ERROR',
      status: 400,
    });
  }
}

export class Bp3UnavailableError extends Bp3Error {
  constructor(message = 'BP3 dependency is unavailable', cause) {
    super(message, {
      code: 'BP3_UNAVAILABLE',
      status: 503,
      cause,
    });
  }
}
