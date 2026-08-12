'use strict';

/**
 * Sesión del agente: cada uno se loguea con su propia cuenta (tabla
 * support.agents, mismo POST /auth/agent-login que ya usa el CRM en React)
 * -- no hay intercambio de sesión con el sistema empresa, es un login
 * directo e independiente. El token dura 24h (AGENT_ACCESS_TOKEN_TTL_SECONDS
 * en el Core), se guarda en localStorage para sobrevivir a un refresh.
 */
const AUTH_STORAGE_KEY = 'modulo_chats_auth';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAccessToken() {
  return getSession()?.accessToken || null;
}

function getAgent() {
  return getSession()?.agent || null;
}

/**
 * El login NO devuelve la lista de permisos (solo id/email/fullName/role) --
 * los permisos reales viven adentro del JWT y los aplica el Core en cada
 * endpoint (requirePermission). Acá, igual que en el CRM en React
 * (AssignmentPanel.tsx), el `role` se usa solo como pista para no OFRECER
 * en la UI una acción que el backend va a rechazar -- nunca es la
 * autorización real, esa siempre la decide el servidor.
 */
function isSupervisorOrAdmin() {
  const role = getAgent()?.role;
  return role === 'supervisor' || role === 'admin';
}

async function login(email, password) {
  const res = await fetch(`${window.APP_CONFIG.CORE_API_URL}/auth/agent-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || 'Credenciales inválidas');
  setSession({ accessToken: body.data.accessToken, agent: body.data.agent });
  return body.data;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

/** Llamar al principio de cada página protegida (bandeja/facturacion/auditoria). */
function requireAuth() {
  if (!getAccessToken()) {
    window.location.href = 'index.html';
    throw new Error('redirigiendo a login');
  }
}
