import { Bp4M1Error } from '../../../m1/backend/src/errors.js';

export class ModuleANotFoundError extends Bp4M1Error {
  constructor(message = 'Resource not found') {
    super(message, {
      code: 'BP4_MODULE_A_NOT_FOUND',
      status: 404,
    });
  }
}
