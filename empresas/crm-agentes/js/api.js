'use strict';

/**
 * Capa fina sobre fetch, calcada de frontend/src/features/support/api/supportApi.ts
 * (el CRM en React) -- mismos endpoints, mismos contratos, solo que acá se
 * llama directo desde JS plano en vez de axios+React Query.
 */
async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${window.APP_CONFIG.CORE_API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    throw new Error('Sesión vencida, volviendo a iniciar sesión...');
  }
  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = new Error(body?.error?.message || `Error ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

function qs(params) {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.set(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

const Api = {
  // Clientes / bandeja (05-modelo-datos, un chat continuo por RUC)
  listCustomers: (params) => apiFetch(`/support/customers${qs(params)}`),
  listConversations: (params) => apiFetch(`/support/conversations${qs(params)}`),
  getConversation: (id) => apiFetch(`/conversations/${id}`),

  // Mensajes
  listMessages: (conversationId, params) => apiFetch(`/conversations/${conversationId}/messages${qs(params)}`),
  sendMessage: (conversationId, payload) =>
    apiFetch(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteMessage: (conversationId, messageId) =>
    apiFetch(`/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' }),
  markRead: (conversationId) => apiFetch(`/conversations/${conversationId}/read`, { method: 'POST' }),
  uploadAttachment: (conversationId, formData) =>
    apiFetch(`/conversations/${conversationId}/attachments`, { method: 'POST', body: formData }),

  // Asignación / estado
  listAgents: (activeOnly) => apiFetch(`/support/agents${qs({ activeOnly: activeOnly ? 'true' : undefined })}`),
  assignConversation: (conversationId, agentId) =>
    apiFetch(`/support/conversations/${conversationId}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  releaseConversation: (conversationId, reason) =>
    apiFetch(`/support/conversations/${conversationId}/release`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateStatus: (conversationId, status) =>
    apiFetch(`/support/conversations/${conversationId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateAttentionMode: (conversationId, attentionMode) =>
    apiFetch(`/support/conversations/${conversationId}/attention-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ attentionMode }),
    }),

  // Notas internas
  listNotes: (conversationId) => apiFetch(`/support/conversations/${conversationId}/notes`),
  createNote: (conversationId, content) =>
    apiFetch(`/support/conversations/${conversationId}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (conversationId, noteId) =>
    apiFetch(`/support/conversations/${conversationId}/notes/${noteId}`, { method: 'DELETE' }),

  // Cliente y pagos (resumen financiero, P1.4)
  getCustomerSummary: (externalCustomerId) => apiFetch(`/support/customers/${externalCustomerId}/summary`),

  // Facturación (aparte del chat, ver migración 020)
  listInvoices: (params) => apiFetch(`/support/invoices${qs(params)}`),
  markInvoicePaid: (invoiceId) => apiFetch(`/support/invoices/${invoiceId}/mark-paid`, { method: 'PATCH' }),

  // Auditoría
  listAuditEvents: (params) => apiFetch(`/support/audit-events${qs(params)}`),

  // Descargas: requieren Authorization, no se puede usar <a href> directo
  async downloadBlob(path, suggestedFilename) {
    const token = getAccessToken();
    const res = await fetch(`${window.APP_CONFIG.CORE_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message || `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedFilename || 'archivo';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  async blobUrl(path) {
    const token = getAccessToken();
    const res = await fetch(`${window.APP_CONFIG.CORE_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
