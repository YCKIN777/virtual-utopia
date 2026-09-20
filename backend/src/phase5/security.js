import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Phase5UnauthorizedError } from './errors.js';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** 前端「密码加密传输」使用的 SHA-256 摘要（十六进制）。 */
export const sha256Hex = (value) =>
  createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const decode = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);

  return ['scrypt', salt, Buffer.from(derivedKey).toString('hex')].join('$');
};

export const verifyPassword = async (password, encodedHash) => {
  const [algorithm, salt, storedHash] = encodedHash.split('$');

  if (algorithm !== 'scrypt' || !salt || !storedHash) {
    return false;
  }

  const derivedKey = Buffer.from(await scryptAsync(password, salt, KEY_LENGTH));
  const storedKey = Buffer.from(storedHash, 'hex');

  return (
    derivedKey.length === storedKey.length &&
    timingSafeEqual(derivedKey, storedKey)
  );
};

export const createAccessToken = ({
  user,
  secret,
  ttlSeconds,
  now = Date.now,
}) => {
  const issuedAt = Math.floor(now() / 1000);
  const payload = encode({
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  });
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  return {
    token: `${payload}.${signature}`,
    expiresAt: new Date((issuedAt + ttlSeconds) * 1000).toISOString(),
  };
};

export const verifyAccessToken = ({ token, secret, now = Date.now }) => {
  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    throw new Phase5UnauthorizedError('invalid access token');
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Phase5UnauthorizedError('invalid access token');
  }

  let claims;

  try {
    claims = decode(payload);
  } catch {
    throw new Phase5UnauthorizedError('invalid access token');
  }

  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(now() / 1000)) {
    throw new Phase5UnauthorizedError('access token expired');
  }

  return claims;
};
