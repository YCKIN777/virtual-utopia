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

// P5.1-①：账号存在且凭据正确，但状态不允许登录（pending 待审批 / disabled 已驳回 / moved_out 已迁出）。
// 与「用户名或密码错误」（PHASE5_UNAUTHORIZED）区分，前端可据此显示准确提示。
export class Phase5AccountInactiveError extends Phase5Error {
  constructor(message, { status, ...rest } = {}) {
    super(message, {
      code: 'PHASE5_ACCOUNT_INACTIVE',
      statusCode: 403,
      ...rest,
    });
    this.name = 'Phase5AccountInactiveError';
    this.status = status;
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
