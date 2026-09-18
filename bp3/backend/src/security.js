import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Bp3UnauthorizedError } from './errors.js';

const encode = (value) => Buffer.from(value).toString('base64url');

const decode = (value) => Buffer.from(value, 'base64url').toString('utf8');

const sign = (value, secret) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

export const createOpaqueToken = (bytes = 24) =>
  randomBytes(bytes).toString('base64url');

export const createSignedToken = ({ payload, secret, ttlSeconds }) => {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedBody = encode(JSON.stringify(body));
  const signature = sign(encodedBody, secret);

  return {
    token: `${encodedBody}.${signature}`,
    expiresAt: new Date(body.exp * 1000).toISOString(),
  };
};

export const verifySignedToken = ({ token, secret }) => {
  if (typeof token !== 'string') {
    throw new Bp3UnauthorizedError('Invalid token');
  }

  const [encodedBody, providedSignature] = token.split('.');

  if (!encodedBody || !providedSignature) {
    throw new Bp3UnauthorizedError('Invalid token');
  }

  const expectedSignature = sign(encodedBody, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Bp3UnauthorizedError('Invalid token signature');
  }

  const payload = JSON.parse(decode(encodedBody));

  if (
    !Number.isFinite(payload.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Bp3UnauthorizedError('Voice token expired');
  }

  return payload;
};
