'use strict';

const $ = (id) => document.getElementById(id);

function log(msg) {
  const el = $('log');
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

async function enviarFactura(payload) {
  const res = await fetch('enviar-factura.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

$('btnEnviarFactura').addEventListener('click', async () => {
  const payload = {
    externalCustomerId: $('facRuc').value.trim(),
    razonSocial: $('facRazonSocial').value.trim(),
    numeroFactura: $('facNumero').value.trim(),
    monto: $('facMonto').value.trim(),
    moneda: $('facMoneda').value.trim(),
    fechaVencimiento: $('facVence').value.trim(),
  };
  try {
    log(`POST /enviar-factura.php (RUC ${payload.externalCustomerId})...`);
    const body = await enviarFactura(payload);
    log(`Factura ${payload.numeroFactura} registrada (id ${body.invoice.id}, estado ${body.invoice.status}).`);
    await cargarFacturas();
  } catch (err) {
    log(`FALLO al enviar la factura: ${err.message}`);
  }
});

// Lote: una llamada por fila, en secuencia (no en paralelo) para no
// pasarse del rate limit de /integration/* en el Core (60/min, ver
// rateLimiters.js) si la lista es larga.
const LOTE_DELAY_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

$('btnEnviarLote').addEventListener('click', async () => {
  const filas = $('facturasLote').value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  $('btnEnviarLote').disabled = true;
  let ok = 0;
  let fallidas = 0;

  for (let i = 0; i < filas.length; i++) {
    const partes = filas[i].split(',').map((p) => p.trim());
    const [externalCustomerId, razonSocial, numeroFactura, monto, moneda, fechaVencimiento] = partes;
    $('estadoLote').textContent = `enviando ${i + 1}/${filas.length}...`;

    if (!externalCustomerId || !numeroFactura) {
      fallidas++;
      log(`Fila ${i + 1} inválida, se omite: "${filas[i]}"`);
      continue;
    }

    try {
      log(`[lote ${i + 1}/${filas.length}] POST /enviar-factura.php (RUC ${externalCustomerId})...`);
      const body = await enviarFactura({ externalCustomerId, razonSocial, numeroFactura, monto, moneda, fechaVencimiento });
      log(`  -> factura ${numeroFactura} registrada para ${razonSocial || externalCustomerId} (id ${body.invoice.id}, estado ${body.invoice.status}).`);
      ok++;
    } catch (err) {
      fallidas++;
      log(`  -> FALLÓ para ${externalCustomerId}: ${err.message}`);
    }

    if (i < filas.length - 1) await sleep(LOTE_DELAY_MS);
  }

  $('estadoLote').textContent = `listo: ${ok} enviadas, ${fallidas} fallidas`;
  $('btnEnviarLote').disabled = false;
  log(`Lote terminado: ${ok} enviadas, ${fallidas} fallidas de ${filas.length} filas.`);
  await cargarFacturas();
});

// Esto es lo nuevo: leer de vuelta el registro y pintarlo -- lo que haría
// el backend real contra GET /integration/invoices con EMPRESAS_API_KEY.
function pintarFacturas(invoices) {
  const tbody = $('tablaFacturas');
  if (!invoices.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No hay facturas para este filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = invoices.map((inv) => {
    const badge = inv.status === 'paid' ? 'badge-paid' : 'badge-pending';
    const fechaPago = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '-';
    return `<tr>
      <td>${inv.customerDisplayName || inv.externalCustomerId}<br><span class="text-muted small">${inv.externalCustomerId}</span></td>
      <td>${inv.invoiceNumber}</td>
      <td>${inv.currency} ${inv.amount}</td>
      <td><span class="badge ${badge}">${inv.status}</span></td>
      <td>${fechaPago}</td>
    </tr>`;
  }).join('');
}

async function cargarFacturas() {
  const ruc = $('filtroRuc').value.trim();
  const params = new URLSearchParams();
  if (ruc) params.set('externalCustomerId', ruc);
  try {
    log(`GET /listar-facturas.php${ruc ? ` (RUC ${ruc})` : ' (todas)'}...`);
    const res = await fetch(`listar-facturas.php?${params}`);
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    pintarFacturas(body.data);
    log(`${body.data.length} factura(s) cargada(s). Nota: aquí se marca "pagado" a mano en el CRM tras revisar el comprobante -- este demo no lo hace, solo lee lo que ya esté marcado.`);
  } catch (err) {
    log(`FALLO al cargar facturas: ${err.message}`);
  }
}

$('btnActualizar').addEventListener('click', cargarFacturas);
$('btnFiltrar').addEventListener('click', cargarFacturas);

cargarFacturas();
