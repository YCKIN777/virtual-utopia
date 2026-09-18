const m4BaseUrl = import.meta.env.VITE_BP4_M4_API_URL || '/bp4-m4-api';
const phase5BaseUrl = import.meta.env.VITE_PHASE5_API_URL || '/phase5-api';

const requestJson = async ({
  baseUrl = m4BaseUrl,
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
    const error = new Error(payload?.message || 'M4请求失败');

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

export const createM4Client = ({ token = '' } = {}) => {
  const request = (path, options = {}) =>
    requestJson({ path, token, ...options });

  return Object.freeze({
    session: () => request('/api/bp4/m4/session'),
    templates: (type = '') =>
      request(
        `/api/bp4/m4/templates${
          type ? `?type=${encodeURIComponent(type)}` : ''
        }`,
      ),
    createTemplate: (template) =>
      request('/api/bp4/m4/templates', {
        method: 'POST',
        body: template,
      }),
    updateTemplate: (templateId, fields) =>
      request(`/api/bp4/m4/templates/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        body: fields,
      }),
    publishTemplate: (templateId) =>
      request(
        `/api/bp4/m4/templates/${encodeURIComponent(templateId)}/publish`,
        { method: 'POST' },
      ),
    dashboard: () => request('/api/bp4/m4/dashboard'),
    audit: () => request('/api/bp4/m4/audit'),
  });
};
