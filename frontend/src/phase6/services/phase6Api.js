const viteEnv = import.meta.env || {};
const defaultBaseUrl = viteEnv.VITE_PHASE6_API_BASE_URL || 'http://localhost:3400';

export class Phase6ApiError extends Error {
  constructor(
    message,
    { code = 'PHASE6_API_ERROR', statusCode = 0, details, cause } = {},
  ) {
    super(message, { cause });
    this.name = 'Phase6ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const buildQuery = (parameters = {}) => {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }

  const encoded = query.toString();

  return encoded ? `?${encoded}` : '';
};

const parsePayload = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      code: 'PHASE6_INVALID_RESPONSE',
      message: '服务返回了无法解析的数据',
    };
  }
};

export const createPhase6Api = ({
  baseUrl = defaultBaseUrl,
  fetchImpl = globalThis.fetch,
  getToken = () => null,
  onUnauthorized = () => {},
} = {}) => {
  const request = async (
    path,
    { method = 'GET', body, headers = {}, authenticated = true } = {},
  ) => {
    const requestHeaders = {
      ...headers,
    };
    const token = getToken();

    if (authenticated && token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;

    if (body !== undefined && !isFormData) {
      requestHeaders['Content-Type'] =
        requestHeaders['Content-Type'] || 'application/json';
    }

    let response;

    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined || isFormData ? body : JSON.stringify(body),
      });
    } catch (error) {
      throw new Phase6ApiError('无法连接Phase6服务', {
        code: 'PHASE6_NETWORK_ERROR',
        cause: error,
      });
    }

    const payload = await parsePayload(response);

    if (!response.ok) {
      if (response.status === 401) {
        onUnauthorized();
      }

      throw new Phase6ApiError(payload?.message || '请求处理失败', {
        code: payload?.code || 'PHASE6_API_ERROR',
        statusCode: response.status,
        details: payload?.details,
      });
    }

    return payload;
  };

  return Object.freeze({
    login({ username, password }) {
      return request('/api/phase6/auth/login', {
        method: 'POST',
        authenticated: false,
        body: {
          username,
          password,
        },
      });
    },
    me() {
      return request('/api/phase6/auth/me');
    },
    logout() {
      return request('/api/phase6/auth/logout', {
        method: 'POST',
      });
    },
    listDocuments(parameters = {}) {
      return request(`/api/phase6/documents${buildQuery(parameters)}`);
    },
    getDocument(id) {
      return request(`/api/phase6/documents/${encodeURIComponent(id)}`);
    },
    uploadDocument({ file, collectionName, title }) {
      const formData = new FormData();

      formData.set('file', file);
      formData.set('collectionName', collectionName);

      if (title) {
        formData.set('title', title);
      }

      return request('/api/phase6/documents/upload', {
        method: 'POST',
        body: formData,
      });
    },
    deleteDocument(id) {
      return request(`/api/phase6/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    listSessions(parameters = {}) {
      return request(`/api/phase6/sessions${buildQuery(parameters)}`);
    },
    getSession(id) {
      return request(`/api/phase6/sessions/${encodeURIComponent(id)}`);
    },
    onboardResident(payload) {
      return request('/api/phase6/residents', {
        method: 'POST',
        body: payload,
      });
    },
    listResidents() {
      return request('/api/phase6/residents');
    },
    departResident(userId) {
      return request(`/api/phase6/residents/${encodeURIComponent(userId)}/depart`, {
        method: 'POST',
      });
    },
    resetResidentPassword(userId, password) {
      return request(`/api/phase6/residents/${encodeURIComponent(userId)}/reset-password`, {
        method: 'POST',
        body: { password },
      });
    },
    listResidentApplications() {
      return request('/api/phase6/resident-applications');
    },
    approveResidentApplication(userId, payload = {}) {
      return request(
        `/api/phase6/resident-applications/${encodeURIComponent(userId)}/approve`,
        {
          method: 'POST',
          body: payload,
        },
      );
    },
    rejectResidentApplication(userId, reason) {
      return request(
        `/api/phase6/resident-applications/${encodeURIComponent(userId)}/reject`,
        {
          method: 'POST',
          body: { reason },
        },
      );
    },
    getVisitorQuotaStats() {
      return request('/api/phase6/visitor-quotas/stats');
    },
    issueAdminInvitation() {
      return request('/api/phase6/visitor-quotas/admin-issue', {
        method: 'POST',
      });
    },
    removeVisitor(userId) {
      return request(`/api/phase6/visitors/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
    },
    listPlots() {
      return request('/api/phase6/plots');
    },
    assignPlot(payload) {
      return request('/api/phase6/plots', {
        method: 'POST',
        body: payload,
      });
    },
    revokePlot(plotNumber) {
      return request(`/api/phase6/plots/${encodeURIComponent(plotNumber)}`, {
        method: 'DELETE',
      });
    },
    renamePlot(plotNumber, customName) {
      return request(`/api/phase6/plots/${encodeURIComponent(plotNumber)}`, {
        method: 'PUT',
        body: { customName },
      });
    },
  });
};
