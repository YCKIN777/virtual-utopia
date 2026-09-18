import { Bp4UnauthorizedError } from './errors.js';

export const createPhase5AuthAdapter = ({
  phase5BaseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 4000,
}) => {
  const authenticate = async (authorization) => {
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new Bp4UnauthorizedError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${phase5BaseUrl}/api/phase5/auth/me`, {
        headers: { Authorization: authorization },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.id) {
        throw new Bp4UnauthorizedError('Phase5 identity is unavailable');
      }

      return {
        id: Number(payload.id),
        username: payload.username,
        role: payload.role,
        displayName: payload.displayName || payload.username,
      };
    } catch (error) {
      if (error instanceof Bp4UnauthorizedError) {
        throw error;
      }

      throw new Bp4UnauthorizedError(
        controller.signal.aborted
          ? 'Phase5 identity timeout'
          : 'Phase5 identity request failed',
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  return Object.freeze({ authenticate });
};
