export class Bp4M1Error extends Error {
  constructor(
    message,
    { code = 'BP4_M1_ERROR', status = 500, details = null, cause } = {},
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class Bp4UnauthorizedError extends Bp4M1Error {
  constructor(message = 'Authentication is required') {
    super(message, {
      code: 'BP4_UNAUTHORIZED',
      status: 401,
    });
  }
}

export class Bp4ForbiddenError extends Bp4M1Error {
  constructor(message = 'Operation is forbidden') {
    super(message, {
      code: 'BP4_FORBIDDEN',
      status: 403,
    });
  }
}

export class Bp4ValidationError extends Bp4M1Error {
  constructor(message = 'Invalid request') {
    super(message, {
      code: 'BP4_VALIDATION_ERROR',
      status: 400,
    });
  }
}

export class Bp4ConflictError extends Bp4M1Error {
  constructor(message = 'Resource conflict') {
    super(message, {
      code: 'BP4_CONFLICT',
      status: 409,
    });
  }
}
