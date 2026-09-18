import { Bp4M1Error } from '../../../m1/backend/src/errors.js';

export class ModuleBNotFoundError extends Bp4M1Error {
  constructor(message = 'Resource not found') {
    super(message, {
      code: 'BP4_MODULE_B_NOT_FOUND',
      status: 404,
    });
  }
}

export class ModuleBDependencyError extends Bp4M1Error {
  constructor(message = 'Dependency service unavailable') {
    super(message, {
      code: 'BP4_MODULE_B_DEPENDENCY_ERROR',
      status: 503,
    });
  }
}
