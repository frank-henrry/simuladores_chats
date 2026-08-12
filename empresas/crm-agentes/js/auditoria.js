'use strict';

/**
 * Calcado de AuditPage.tsx (el CRM en React): vista simple, no exhaustiva,
 * de los eventos en support.audit_events. Filtros básicos, sin paginación
 * (igual que la versión en React: limit=100 y listo). Los eventos vienen
 * en snake_case crudo de la base (created_at, actor_type, etc.), sin
 * mapeo camelCase -- por eso field() prueba ambas formas.
 */
requireAuth();
document.getElementById('nombre-agente').textContent = `${getAgent()?.fullName || ''} (${ROLE_LABEL_ES[getAgent()?.role] || getAgent()?.role || ''})`;
document.getElementById('btn-logout').addEventListener('click', logout);

function field(evt, camel, snake) {
  return evt[camel] ?? evt[snake] ?? '';
}

let filterTimeout = null;
async function cargarAuditoria() {
  const resourceType = document.getElementById('filtro-recurso').value.trim();
  const actorId = document.getElementById('filtro-actor').value.trim();

  document.getElementById('alerta-permiso').classList.add('d-none');
  document.getElementById('alerta-error').classList.add('d-none');

  try {
    const { data: events } = await Api.listAuditEvents({
      resourceType: resourceType || undefined,
      actorId: actorId || undefined,
      limit: 100,
    });
    renderAuditoria(events);
  } catch (err) {
    document.getElementById('cuerpo-auditoria').innerHTML = '';
    document.getElementById('vacio-auditoria').classList.add('d-none');
    if (err.status === 403) {
      document.getElementById('alerta-permiso').classList.remove('d-none');
    } else {
      document.getElementById('alerta-error').classList.remove('d-none');
    }
  }
}

function renderAuditoria(events) {
  document.getElementById('vacio-auditoria').classList.toggle('d-none', events.length > 0);
  document.getElementById('cuerpo-auditoria').innerHTML = events
    .map((evt) => {
      const createdAt = field(evt, 'createdAt', 'created_at');
      const actorType = field(evt, 'actorType', 'actor_type');
      const actorId = field(evt, 'actorId', 'actor_id');
      const resourceType = field(evt, 'resourceType', 'resource_type');
      const resourceId = field(evt, 'resourceId', 'resource_id');
      return `<tr>
        <td class="small text-secondary">${createdAt ? new Date(createdAt).toLocaleString() : ''}</td>
        <td class="font-monospace small">${escapeHtml(actorType)}:${escapeHtml(String(actorId).slice(0, 8))}</td>
        <td class="small">${escapeHtml(evt.action)}</td>
        <td class="font-monospace small">${escapeHtml(resourceType)}:${escapeHtml(String(resourceId).slice(0, 8))}</td>
        <td><span class="badge ${evt.outcome === 'success' ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'}">${escapeHtml(evt.outcome)}</span></td>
      </tr>`;
    })
    .join('');
}

document.getElementById('filtro-recurso').addEventListener('input', () => {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(cargarAuditoria, 400);
});
document.getElementById('filtro-actor').addEventListener('input', () => {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(cargarAuditoria, 400);
});

cargarAuditoria();
