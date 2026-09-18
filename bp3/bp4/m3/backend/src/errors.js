import { Bp4M1Error } from '../../../m1/backend/src/errors.js';

export class Bp4M3NotFoundError extends Bp4M1Error {
  constructor(message = 'Resource not found') {
    super(message, {
      code: 'BP4_NOT_FOUND',
      status: 404,
    });
  }
}
