'use strict';

/**
 * Calcado de InvoicesPage.tsx (el CRM en React): tabla de facturas que
 * llegaron por /integration/invoices (nada que ver con el chat, ver
 * migración 020). Incluye la detección explícita de 403 -- si el agente
 * entró ANTES de que se agregara el permiso invoice:read/manage a su rol,
 * su token viejo no lo trae y esto se vería como "no hay facturas" sin el
 * aviso; por eso se distingue el error de permisos del caso "vacío".
 */
requireAuth();
document.getElementById('nombre-agente').textContent = `${getAgent()?.fullName || ''} (${ROLE_LABEL_ES[getAgent()?.role] || getAgent()?.role || ''})`;
document.getElementById('btn-logout').addEventListener('click', logout);

let cursor = null;
let allInvoices = [];
let search = '';
let status = '';
let searchTimeout = null;

async function cargarFacturas(reset) {
  if (reset) {
    cursor = null;
    allInvoices = [];
  }
  document.getElementById('alerta-permiso').classList.add('d-none');
  try {
    const { data, nextCursor } = await Api.listInvoices({ search, status, limit: 20, cursor });
    allInvoices = reset ? data : allInvoices.concat(data);
    cursor = nextCursor;
    document.getElementById('btn-mas-facturas').classList.toggle('d-none', !nextCursor);
    renderFacturas();
  } catch (err) {
    if (err.status === 403) {
      document.getElementById('alerta-permiso').classList.remove('d-none');
      document.getElementById('cuerpo-facturas').innerHTML = '';
      document.getElementById('vacio-facturas').classList.add('d-none');
    } else {
      mostrarToast(err.message || 'No se pudieron cargar las facturas', 'danger');
    }
  }
}

function renderFacturas() {
  const cuerpo = document.getElementById('cuerpo-facturas');
  document.getElementById('vacio-facturas').classList.toggle('d-none', allInvoices.length > 0);

  cuerpo.innerHTML = allInvoices
    .map(
      (inv) => `
    <tr data-invoice-id="${inv.id}">
      <td>
        <div class="text-truncate" style="max-width: 220px;">${escapeHtml(inv.customerDisplayName || inv.externalCustomerId)}</div>
        ${inv.customerDisplayName ? `<div class="font-monospace text-secondary" style="font-size:0.7rem;">${escapeHtml(inv.externalCustomerId)}</div>` : ''}
      </td>
      <td class="font-monospace small">${escapeHtml(inv.invoiceNumber)}</td>
      <td>${Number(inv.amount).toFixed(2)} ${escapeHtml(inv.currency)}</td>
      <td class="small">${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
      <td><span class="${INVOICE_STATUS_BADGE_CLASS[inv.status] || 'badge bg-secondary'}">${INVOICE_STATUS_LABEL_ES[inv.status] || inv.status}</span></td>
      <td class="small text-secondary">${new Date(inv.createdAt).toLocaleString()}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary btn-descargar" title="Descargar PDF"><i class="bi bi-download"></i></button>
        ${inv.status === 'pending' ? `<button class="btn btn-sm btn-outline-success btn-marcar-pagada" title="Marcar pagada"><i class="bi bi-check-lg"></i></button>` : ''}
      </td>
    </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('.btn-descargar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-invoice-id]').dataset.invoiceId;
      const inv = allInvoices.find((i) => i.id === id);
      Api.downloadBlob(`/support/invoices/${id}/download`, inv?.originalFilename || `${inv?.invoiceNumber || id}.pdf`).catch((err) =>
        mostrarToast(err.message || 'No se pudo descargar la factura', 'danger')
      );
    });
  });
  cuerpo.querySelectorAll('.btn-marcar-pagada').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-invoice-id]').dataset.invoiceId;
      try {
        await Api.markInvoicePaid(id);
        mostrarToast('Factura marcada como pagada', 'success');
        cargarFacturas(true);
      } catch (err) {
        mostrarToast(err.message || 'No se pudo marcar la factura como pagada', 'danger');
      }
    });
  });
}

document.getElementById('buscar-factura').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const valor = e.target.value.trim();
  searchTimeout = setTimeout(() => {
    search = valor;
    cargarFacturas(true);
  }, 400);
});
document.getElementById('filtro-estado').addEventListener('change', (e) => {
  status = e.target.value;
  cargarFacturas(true);
});
document.getElementById('btn-mas-facturas').addEventListener('click', () => cargarFacturas(false));

cargarFacturas(true);
