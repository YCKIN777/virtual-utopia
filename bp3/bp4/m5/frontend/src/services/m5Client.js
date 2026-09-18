const m5BaseUrl = import.meta.env.VITE_BP4_M5_API_URL || '/bp4-m5-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

const requestJson = async ({
  baseUrl = m5BaseUrl,
  path,
  method = 'GET',
  token = '',
  body,
}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.message || 'M5请求失败');

    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }

  return payload;
};

export const loginPhase5 = ({ username, password }) =>
  requestJson({
    baseUrl: phase5BaseUrl,
    path: '/api/phase5/auth/login',
    method: 'POST',
    body: { username, password },
  });

export const createM5Client = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({ path, token, ...options });

  return Object.freeze({
    session: () => request('/api/bp4/m5/session'),
    plots: () => request('/api/bp4/m5/plots'),
    ticket: (channelIds = ['world-main']) =>
      request('/api/bp4/m5/realtime/ticket', {
        method: 'POST',
        body: { channelIds },
      }),
    layout: (plotId) =>
      request(`/api/bp4/m5/homes/${encodeURIComponent(plotId)}/layout`),
    saveLayout: (plotId, items) =>
      request(`/api/bp4/m5/homes/${encodeURIComponent(plotId)}/layout`, {
        method: 'PUT',
        body: { items },
      }),
    events: (plotId, afterSequence = 0) =>
      request(
        `/api/bp4/m5/homes/${encodeURIComponent(
          plotId,
        )}/events?afterSequence=${encodeURIComponent(afterSequence)}`,
      ),
  });
};
