import { createHmac, timingSafeEqual } from 'node:crypto';
import { Bp4UnauthorizedError } from './errors.js';

const encode = (value) => Buffer.from(value).toString('base64url');
const decode = (value) => Buffer.from(value, 'base64url').toString('utf8');
const sign = (value, secret) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export const createTicketService = ({ secret, ttlSeconds = 300 }) => {
  const createTicket = ({
    user,
    scopes = ['realtime'],
    channelIds = ['world-main'],
  }) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      scopes,
      channelIds,
      iat: now,
      exp: now + ttlSeconds,
    };
    const body = encode(JSON.stringify(payload));
    const signature = sign(body, secret);

    return {
      ticket: `${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      scopes,
      channelIds,
    };
  };

  const verifyTicket = (ticket) => {
    if (typeof ticket !== 'string') {
      throw new Bp4UnauthorizedError('BP4 ticket is required');
    }

    const [body, providedSignature] = ticket.split('.');

    if (!body || !providedSignature) {
      throw new Bp4UnauthorizedError('BP4 ticket is invalid');
    }

    const expectedSignature = sign(body, secret);
    const expected = Buffer.from(expectedSignature);
    const provided = Buffer.from(providedSignature);

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new Bp4UnauthorizedError('BP4 ticket signature is invalid');
    }

    const payload = JSON.parse(decode(body));

    if (
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new Bp4UnauthorizedError('BP4 ticket has expired');
    }

    return payload;
  };

  return Object.freeze({
    createTicket,
    verifyTicket,
  });
};
