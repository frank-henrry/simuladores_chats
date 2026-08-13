'use strict';

/**
 * Lógica de la bandeja completa -- calca, en JS plano, lo que en el CRM en
 * React son varios componentes (InboxPage, CustomerList, ConversationView,
 * MessageBubble, MessageComposer, ConversationSidePanel, AssignmentPanel,
 * CustomerPanel, NotesPanel, ResolveButton). Ver README.md del proyecto
 * para el mapeo componente-por-componente.
 */
requireAuth();

// ---- Estado (equivalente a los useState del CRM en React) ----
let mobileView = 'customers'; // 'customers' | 'chat' | 'details' (igual que InboxPage.tsx)
let selectedCustomerId = null;
let conversationId = null;
let currentConversation = null;
let onlyUnread = false;
let customerSearchTimeout = null;
let customerSearch = '';
let customersCursor = null;
let allCustomers = [];
let currentTab = 'detalles';
let mediaRecorder = null;
let audioChunks = [];
let agentsCache = null;

// ---------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------
document.getElementById('nombre-agente').textContent = `${getAgent()?.fullName || ''} (${ROLE_LABEL_ES[getAgent()?.role] || getAgent()?.role || ''})`;

// ---------------------------------------------------------------
// Navegación móvil (3 pantallas: clientes | chat | detalles -- igual que
// InboxPage.tsx, mobileView decide cuál se ve bajo el breakpoint md)
// ---------------------------------------------------------------
function actualizarVistaMovil() {
  const colClientes = document.getElementById('col-clientes');
  const colChat = document.getElementById('col-chat');
  const colDetalles = document.getElementById('col-detalles');

  colClientes.classList.toggle('mobile-visible', mobileView === 'customers');
  colChat.classList.toggle('mobile-visible', mobileView === 'chat');
  colDetalles.classList.toggle('mobile-visible', mobileView === 'details');

  if (window.innerWidth < 768) {
    colClientes.style.display = mobileView === 'customers' ? 'flex' : 'none';
    colChat.style.display = mobileView === 'chat' ? 'flex' : 'none';
    colDetalles.style.display = mobileView === 'details' ? 'flex' : 'none';
  } else {
    colClientes.style.display = '';
    colChat.style.display = '';
    colDetalles.style.display = '';
  }
}
window.addEventListener('resize', actualizarVistaMovil);

document.getElementById('btn-volver-clientes').addEventListener('click', () => {
  mobileView = 'customers';
  actualizarVistaMovil();
});
document.getElementById('btn-ver-detalles').addEventListener('click', () => {
  mobileView = 'details';
  actualizarVistaMovil();
});
document.getElementById('btn-volver-chat-movil').addEventListener('click', () => {
  mobileView = 'chat';
  actualizarVistaMovil();
});

// ---------------------------------------------------------------
// Columna 1: lista de clientes (CustomerList.tsx)
// ---------------------------------------------------------------
async function cargarClientes(reset) {
  if (reset) {
    customersCursor = null;
    allCustomers = [];
  }
  const { data, nextCursor } = await Api.listCustomers({ search: customerSearch, limit: 20, cursor: customersCursor });
  allCustomers = reset ? data : allCustomers.concat(data);
  customersCursor = nextCursor;
  document.getElementById('btn-mas-clientes').classList.toggle('d-none', !nextCursor);
  renderClientes();
}

function renderClientes() {
  const cont = document.getElementById('lista-clientes');
  const visibles = onlyUnread ? allCustomers.filter((c) => c.unreadCount > 0) : allCustomers;
  const noLeidosTotal = allCustomers.filter((c) => c.unreadCount > 0).length;
  document.getElementById('contador-no-leidos').textContent = noLeidosTotal > 0 ? `(${noLeidosTotal})` : '';

  if (visibles.length === 0) {
    cont.innerHTML = `<p class="text-secondary small p-3 fst-italic">${onlyUnread ? 'Sin mensajes sin leer.' : 'Sin clientes para esta búsqueda.'}</p>`;
    return;
  }

  cont.innerHTML = visibles
    .map(
      (c) => `
    <div class="list-group-item list-group-item-action cliente-item p-2 ${c.externalCustomerId === selectedCustomerId ? 'activo' : ''}" data-ruc="${c.externalCustomerId}">
      <div class="d-flex justify-content-between align-items-center">
        <strong class="text-truncate small">${escapeHtml(c.displayName || c.externalCustomerId)}</strong>
        <span class="text-secondary" style="font-size:0.65rem;">${c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : ''}</span>
      </div>
      ${c.displayName ? `<div class="font-monospace text-secondary" style="font-size:0.65rem;">${escapeHtml(c.externalCustomerId)}</div>` : ''}
      <div class="small text-secondary text-truncate">
        ${escapeHtml(
          messagePreviewLabel({
            messageType: c.lastMessageType,
            attachmentCategory: c.lastAttachmentCategory,
            attachmentMime: c.lastAttachmentMime,
            content: c.lastMessagePreview,
          })
        )}
      </div>
      ${c.unreadCount ? `<span class="badge bg-success rounded-pill">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : ''}
    </div>`
    )
    .join('');

  cont.querySelectorAll('[data-ruc]').forEach((el) => {
    el.addEventListener('click', () => seleccionarCliente(el.dataset.ruc));
  });
}

document.getElementById('buscar-cliente').addEventListener('input', (e) => {
  clearTimeout(customerSearchTimeout);
  const valor = e.target.value.trim();
  customerSearchTimeout = setTimeout(() => {
    customerSearch = valor;
    cargarClientes(true);
  }, 400);
});

document.getElementById('filtro-todos').addEventListener('click', () => {
  onlyUnread = false;
  document.getElementById('filtro-todos').classList.replace('btn-outline-success', 'btn-success');
  document.getElementById('filtro-no-leidos').classList.replace('btn-success', 'btn-outline-success');
  renderClientes();
});
document.getElementById('filtro-no-leidos').addEventListener('click', () => {
  onlyUnread = true;
  document.getElementById('filtro-no-leidos').classList.replace('btn-outline-success', 'btn-success');
  document.getElementById('filtro-todos').classList.replace('btn-success', 'btn-outline-success');
  renderClientes();
});
document.getElementById('btn-mas-clientes').addEventListener('click', () => cargarClientes(false));

async function seleccionarCliente(externalCustomerId) {
  selectedCustomerId = externalCustomerId;
  mobileView = 'chat';
  renderClientes();
  actualizarVistaMovil();

  const { data } = await Api.listConversations({ externalCustomerId, limit: 1 });
  if (data.length > 0) {
    abrirConversacion(data[0].id);
  }
}

/** Usado por notificaciones.js al hacer clic en un aviso. */
window.abrirCliente = (externalCustomerId, convId) => {
  mobileView = 'chat';
  actualizarVistaMovil();
  abrirConversacion(convId);
};

// ---------------------------------------------------------------
// Columna 2: chat (ConversationView.tsx + MessageBubble.tsx + MessageComposer.tsx)
// ---------------------------------------------------------------
async function abrirConversacion(id) {
  conversationId = id;
  setActiveConversationId(id);
  document.getElementById('chat-vacio').classList.add('d-none');
  document.getElementById('chat-contenido').classList.remove('d-none');
  document.getElementById('chat-contenido').classList.add('d-flex');

  const { data: conversation } = await Api.getConversation(id);
  currentConversation = conversation;
  if (!selectedCustomerId) selectedCustomerId = conversation.externalCustomerId; // deep-link directo

  renderEncabezadoChat();
  unirseAConversacion(id);
  await cargarMensajes(id);
  await cargarPanelLateral();
}

function renderEncabezadoChat() {
  const c = currentConversation;
  document.getElementById('chat-titulo').textContent = `Chat con ${c.customerDisplayName || c.externalCustomerId}`;
  const st = document.getElementById('chat-badge-status');
  st.className = STATUS_BADGE_CLASS[c.status] || 'badge bg-secondary';
  st.textContent = STATUS_LABEL_ES[c.status] || c.status;
  const md = document.getElementById('chat-badge-modo');
  md.className = ATTENTION_MODE_BADGE_CLASS[c.attentionMode] || 'badge bg-secondary';
  md.textContent = ATTENTION_MODE_LABEL_ES[c.attentionMode] || c.attentionMode;
  document.getElementById('btn-resolver').classList.toggle('d-none', c.attentionMode !== 'human');
}

async function cargarMensajes(id) {
  const { data: mensajes } = await Api.listMessages(id, { limit: 50 });
  const cont = document.getElementById('mensajes');
  cont.innerHTML = '';
  mensajes.forEach((m) => cont.appendChild(construirBurbuja(m)));
  cont.scrollTop = cont.scrollHeight;
  Api.markRead(id).catch(() => {});
}

function construirBurbuja(m) {
  const div = document.createElement('div');
  div.className = `msg-row ${m.senderType !== 'customer' ? 'mine' : ''}`;
  div.dataset.messageId = m.id;

  const esMio = m.senderType === 'support_agent' && m.senderId === getAgent()?.id;
  const puedeBorrar = esMio && !m.deletedAt;

  let contenidoHtml;
  if (m.deletedAt) {
    contenidoHtml = `<div class="msg-bubble deleted"><i class="bi bi-slash-circle"></i> Mensaje eliminado</div>`;
  } else {
    let cuerpo = m.content ? `<div>${escapeHtml(m.content)}</div>` : '';
    if (m.type === 'document' && m.attachments && m.attachments.length > 0) {
      cuerpo += m.attachments.map((a) => construirAdjuntoHtml(a)).join('');
    }
    contenidoHtml = `<div class="msg-bubble ${m.senderType}">${cuerpo}</div>`;
  }

  div.innerHTML = `
    <div>
      <div class="msg-meta">${SENDER_LABEL_ES[m.senderType] || m.senderType}</div>
      ${contenidoHtml}
      <div class="msg-meta">${new Date(m.createdAt).toLocaleString()}</div>
    </div>`;

  // Eliminar por clic derecho (o mantener presionado en móvil) sobre la
  // burbuja, estilo WhatsApp -- en vez de un ícono de basura siempre visible.
  if (puedeBorrar) {
    const bubbleEl = div.querySelector('.msg-bubble');
    bubbleEl.classList.add('eliminable');
    bubbleEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      mostrarMenuContextualMensaje(e.clientX, e.clientY, m.id);
    });
    let pressTimer = null;
    bubbleEl.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      pressTimer = setTimeout(() => mostrarMenuContextualMensaje(touch.clientX, touch.clientY, m.id), 500);
    });
    bubbleEl.addEventListener('touchend', () => clearTimeout(pressTimer));
    bubbleEl.addEventListener('touchmove', () => clearTimeout(pressTimer));
  }
  // Adjuntos de imagen/audio: se cargan como blob autenticado (no se puede
  // poner el token en <img src>/<audio src> directo).
  if (!m.deletedAt && m.attachments) {
    m.attachments.forEach((a) => cargarVistaPrevia(div, a));
  }
  return div;
}

// ---------------------------------------------------------------
// Menú contextual de mensaje (clic derecho / mantener presionado), estilo
// WhatsApp -- por ahora solo trae "Eliminar para todos".
// ---------------------------------------------------------------
let mensajeContextualId = null;

function mostrarMenuContextualMensaje(x, y, messageId) {
  mensajeContextualId = messageId;
  const menu = document.getElementById('menu-contextual-mensaje');
  menu.classList.remove('d-none');
  const w = menu.offsetWidth || 190;
  const h = menu.offsetHeight || 44;
  menu.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - h - 8)}px`;
}

function ocultarMenuContextualMensaje() {
  document.getElementById('menu-contextual-mensaje').classList.add('d-none');
  mensajeContextualId = null;
}

document.addEventListener('click', ocultarMenuContextualMensaje);
document.addEventListener('scroll', ocultarMenuContextualMensaje, true);
document.getElementById('ctx-eliminar-mensaje').addEventListener('click', (e) => {
  e.stopPropagation();
  if (mensajeContextualId) eliminarMensaje(mensajeContextualId);
  ocultarMenuContextualMensaje();
});

function construirAdjuntoHtml(a) {
  return `<div class="border-top mt-2 pt-2" data-attachment-id="${a.id}">
    <div class="adjunto-preview"></div>
    <div class="d-flex align-items-center gap-2 mt-1">
      <i class="bi bi-file-earmark"></i>
      <span class="small text-truncate flex-fill">${escapeHtml(a.originalFilename)}</span>
      ${a.scanStatus === 'clean'
        ? `<button class="btn btn-sm btn-link p-0 btn-descargar-adjunto" data-document-id="${a.documentId}" data-filename="${escapeHtml(a.originalFilename)}"><i class="bi bi-download"></i></button>`
        : `<span class="small text-secondary fst-italic">${SCAN_STATUS_LABEL_ES[a.scanStatus] || a.scanStatus}</span>`}
    </div>
  </div>`;
}

async function cargarVistaPrevia(container, attachment) {
  if (attachment.scanStatus !== 'clean') return;
  const wrapper = container.querySelector(`[data-attachment-id="${attachment.id}"] .adjunto-preview`);
  if (!wrapper) return;
  try {
    if (attachment.mimeType.startsWith('image/')) {
      const url = await Api.blobUrl(`/documents/${attachment.documentId}/download`);
      wrapper.innerHTML = `<img src="${url}" class="img-fluid rounded" style="max-height:220px;" />`;
    } else if (attachment.mimeType.startsWith('audio/')) {
      const url = await Api.blobUrl(`/documents/${attachment.documentId}/download`);
      wrapper.innerHTML = `<audio controls src="${url}" style="height:32px;"></audio>`;
    }
  } catch {
    /* si falla la vista previa, igual queda el botón de descargar */
  }
  container.querySelectorAll('.btn-descargar-adjunto').forEach((btn) => {
    btn.addEventListener('click', () =>
      Api.downloadBlob(`/documents/${btn.dataset.documentId}/download`, btn.dataset.filename).catch(() =>
        mostrarToast('No se pudo descargar el documento', 'danger')
      )
    );
  });
}

async function eliminarMensaje(messageId) {
  if (!confirm('¿Eliminar este mensaje para todos? El cliente ya no lo va a ver. No se puede deshacer.')) return;
  try {
    await Api.deleteMessage(conversationId, messageId);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo eliminar el mensaje', 'danger');
  }
}

document.getElementById('form-enviar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const textarea = document.getElementById('mensaje-texto');
  const contenido = textarea.value.trim();
  if (!contenido) return;
  textarea.value = '';
  textarea.style.height = 'auto';
  alternarBotonEnviar();
  try {
    await Api.sendMessage(conversationId, { clientMessageId: crypto.randomUUID(), content: contenido });
  } catch (err) {
    mostrarToast(err.message || 'No se pudo enviar el mensaje', 'danger');
  }
});
document.getElementById('mensaje-texto').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('form-enviar').requestSubmit();
  }
});

// Estilo WhatsApp: el input crece con el texto (hasta el máximo del CSS,
// que pasa a scroll) y el botón circular alterna micrófono/enviar según si
// hay algo escrito -- nunca se muestran los dos a la vez.
function alternarBotonEnviar() {
  const hayTexto = document.getElementById('mensaje-texto').value.trim().length > 0;
  document.getElementById('btn-grabar').classList.toggle('d-none', hayTexto);
  document.getElementById('btn-enviar').classList.toggle('d-none', !hayTexto);
}
document.getElementById('mensaje-texto').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = `${e.target.scrollHeight}px`;
  alternarBotonEnviar();
});

// ---------------------------------------------------------------
// Menú "+" estilo WhatsApp (Documento / Fotos y videos / Audio / Contacto)
// ---------------------------------------------------------------
function mostrarVistaAdjuntar(vista) {
  document.getElementById('vista-adjuntar-opciones').classList.toggle('d-none', vista !== 'opciones');
  document.getElementById('vista-adjuntar-documento').classList.toggle('d-none', vista !== 'documento');
  document.getElementById('vista-adjuntar-contactos').classList.toggle('d-none', vista !== 'contactos');
}

function cerrarMenuAdjuntar() {
  const instance = bootstrap.Dropdown.getInstance(document.getElementById('btn-menu-adjuntar'));
  if (instance) instance.hide();
}

// Vuelve siempre a la vista inicial al cerrar, para no dejarlo "atascado"
// en Documento/Contacto la próxima vez que lo abran.
document.getElementById('btn-menu-adjuntar').addEventListener('hidden.bs.dropdown', () => mostrarVistaAdjuntar('opciones'));

async function subirArchivoComposer(file, category) {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('clientMessageId', crypto.randomUUID());
  try {
    await Api.uploadAttachment(conversationId, form);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo adjuntar el archivo', 'danger');
  }
}

// -- Documento: único caso que sigue pidiendo categoría (comprobante de pago vs. documento genérico) --
document.getElementById('opt-documento').addEventListener('click', () => mostrarVistaAdjuntar('documento'));
document.getElementById('btn-volver-documento').addEventListener('click', () => mostrarVistaAdjuntar('opciones'));
document.getElementById('btn-adjuntar').addEventListener('click', () => document.getElementById('input-archivo').click());
document.getElementById('input-archivo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await subirArchivoComposer(file, document.getElementById('select-categoria-archivo').value);
  e.target.value = '';
  cerrarMenuAdjuntar();
});

// -- Fotos y videos / Audio: un clic abre el selector nativo filtrado y sube directo --
document.getElementById('opt-fotos').addEventListener('click', () => document.getElementById('input-fotos').click());
document.getElementById('input-fotos').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await subirArchivoComposer(file, 'other');
  e.target.value = '';
  cerrarMenuAdjuntar();
});

document.getElementById('opt-audio').addEventListener('click', () => document.getElementById('input-audio').click());
document.getElementById('input-audio').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await subirArchivoComposer(file, 'other');
  e.target.value = '';
  cerrarMenuAdjuntar();
});

// -- Contacto: lista de agentes de soporte activos; al elegir uno, se manda
// como mensaje de texto con su nombre/rol/correo (no existe un tipo de
// mensaje "contacto" en el backend, así que se manda como texto formateado). --
document.getElementById('opt-contacto').addEventListener('click', async () => {
  mostrarVistaAdjuntar('contactos');
  const cont = document.getElementById('lista-contactos-soporte');
  cont.innerHTML = '<p class="text-secondary small px-2 mb-0">Cargando…</p>';
  try {
    if (!agentsCache) agentsCache = (await Api.listAgents(true)).data;
    cont.innerHTML = agentsCache.length
      ? agentsCache
          .map(
            (a) => `
      <button type="button" class="dropdown-item d-flex align-items-center gap-2 py-2 btn-elegir-contacto" data-agent-id="${a.id}">
        <span class="adjuntar-icono icono-contacto"><i class="bi bi-person-fill"></i></span>
        <span class="text-truncate">
          <span class="d-block small">${escapeHtml(a.full_name)}</span>
          <span class="d-block text-secondary" style="font-size:0.7rem;">${escapeHtml(ROLE_LABEL_ES[a.role] || a.role)}</span>
        </span>
      </button>`
          )
          .join('')
      : '<p class="text-secondary small px-2 mb-0">Sin agentes disponibles.</p>';

    cont.querySelectorAll('.btn-elegir-contacto').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const agente = agentsCache.find((a) => a.id === btn.dataset.agentId);
        if (!agente) return;
        const texto = `📇 Contacto de soporte\nNombre: ${agente.full_name}\nÁrea: ${ROLE_LABEL_ES[agente.role] || agente.role}\nCorreo: ${agente.email}`;
        try {
          await Api.sendMessage(conversationId, { clientMessageId: crypto.randomUUID(), content: texto });
        } catch (err) {
          mostrarToast(err.message || 'No se pudo enviar el contacto', 'danger');
        }
        cerrarMenuAdjuntar();
      });
    });
  } catch {
    cont.innerHTML = '<p class="text-danger small px-2 mb-0">No se pudo cargar la lista de agentes.</p>';
  }
});

// ---------------------------------------------------------------
// Grabar audio estilo WhatsApp: grabando -> detener -> revisar (escuchar,
// descartar o recién ahí enviar). Nunca se manda de un tirón al soltar.
// ---------------------------------------------------------------
let grabacionStream = null;
let grabacionTimer = null;
let grabacionSegundos = 0;
let grabacionCancelada = false;
let audioBlobPendiente = null;

function mostrarComposer(vista) {
  document.getElementById('composer-normal').classList.toggle('d-none', vista !== 'normal');
  document.getElementById('composer-normal').classList.toggle('d-flex', vista === 'normal');
  document.getElementById('composer-grabando').classList.toggle('d-none', vista !== 'grabando');
  document.getElementById('composer-grabando').classList.toggle('d-flex', vista === 'grabando');
  document.getElementById('composer-revisar').classList.toggle('d-none', vista !== 'revisar');
  document.getElementById('composer-revisar').classList.toggle('d-flex', vista === 'revisar');
}

function formatearTiempoGrabacion(segundos) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

document.getElementById('btn-grabar').addEventListener('click', async () => {
  try {
    grabacionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    grabacionCancelada = false;
    mediaRecorder = new MediaRecorder(grabacionStream);
    mediaRecorder.ondataavailable = (e) => e.data.size > 0 && audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      grabacionStream.getTracks().forEach((t) => t.stop());
      clearInterval(grabacionTimer);
      if (grabacionCancelada) {
        mostrarComposer('normal');
        return;
      }
      audioBlobPendiente = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      document.getElementById('audio-preview').src = URL.createObjectURL(audioBlobPendiente);
      mostrarComposer('revisar');
    };
    mediaRecorder.start();

    grabacionSegundos = 0;
    document.getElementById('grabando-tiempo').textContent = '0:00';
    grabacionTimer = setInterval(() => {
      grabacionSegundos += 1;
      document.getElementById('grabando-tiempo').textContent = formatearTiempoGrabacion(grabacionSegundos);
    }, 1000);
    mostrarComposer('grabando');
  } catch (err) {
    mostrarToast('No se pudo acceder al micrófono: ' + err.message, 'danger');
  }
});

document.getElementById('btn-detener-grabacion').addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
});

document.getElementById('btn-cancelar-grabacion').addEventListener('click', () => {
  grabacionCancelada = true;
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  else mostrarComposer('normal');
});

document.getElementById('btn-descartar-audio').addEventListener('click', () => {
  audioBlobPendiente = null;
  document.getElementById('audio-preview').src = '';
  mostrarComposer('normal');
});

document.getElementById('btn-enviar-audio').addEventListener('click', async () => {
  if (!audioBlobPendiente) return;
  const form = new FormData();
  form.append('file', audioBlobPendiente, `nota-de-voz-${Date.now()}.webm`);
  form.append('category', 'voice_note');
  form.append('clientMessageId', crypto.randomUUID());
  try {
    await Api.uploadAttachment(conversationId, form);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo mandar el audio', 'danger');
  }
  audioBlobPendiente = null;
  document.getElementById('audio-preview').src = '';
  mostrarComposer('normal');
});

document.getElementById('btn-resolver').addEventListener('click', async () => {
  try {
    await Api.updateStatus(conversationId, 'resolved');
    await Api.updateAttentionMode(conversationId, 'ai');
    mostrarToast('Resuelto -- devuelto a la IA para la próxima vez que escriba el cliente', 'success');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  }
});

// ---------------------------------------------------------------
// Columna 3: detalles (AssignmentPanel.tsx + CustomerPanel.tsx) y notas (NotesPanel.tsx)
// ---------------------------------------------------------------
document.querySelectorAll('#tabs-detalles [data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('#tabs-detalles [data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-detalles').classList.toggle('d-none', currentTab !== 'detalles');
    document.getElementById('panel-notas').classList.toggle('d-none', currentTab !== 'notas');
    document.getElementById('panel-notas').classList.toggle('d-flex', currentTab === 'notas');
    if (currentTab === 'notas') cargarNotas();
  });
});

const STATUS_OPTIONS = ['open', 'waiting_ai', 'waiting_support', 'waiting_customer', 'resolved'];
const ATTENTION_MODE_OPTIONS = ['ai', 'human', 'hybrid'];

async function cargarPanelLateral() {
  const c = currentConversation;
  document.getElementById('detalle-ruc').textContent = c.externalCustomerId;
  document.getElementById('detalle-asignado').textContent = c.assignedAgentId
    ? c.assignedAgentId === getAgent()?.id
      ? 'Tú'
      : c.assignedAgentId.slice(0, 8)
    : 'Sin asignar';

  const puedeReasignar = isSupervisorOrAdmin();
  document.getElementById('grupo-reasignar').classList.toggle('d-none', !puedeReasignar);
  if (puedeReasignar) {
    if (!agentsCache) agentsCache = (await Api.listAgents(true)).data;
    const select = document.getElementById('select-reasignar');
    select.innerHTML =
      '<option value="">Elegir agente…</option>' +
      agentsCache
        .filter((a) => a.id !== c.assignedAgentId)
        .map((a) => `<option value="${a.id}">${escapeHtml(a.full_name)} (${ROLE_LABEL_ES[a.role] || a.role})</option>`)
        .join('');
  }

  const puedeReabrir = isSupervisorOrAdmin();
  const esEstadoCerrado = c.status === 'resolved' || c.status === 'closed';
  const opcionesEstado = STATUS_OPTIONS.filter((s) => !(s === 'open' && esEstadoCerrado && !puedeReabrir));
  const selectEstado = document.getElementById('select-estado');
  selectEstado.innerHTML = opcionesEstado.map((s) => `<option value="${s}">${STATUS_LABEL_ES[s]}</option>`).join('');
  selectEstado.value = c.status;

  const selectModo = document.getElementById('select-modo');
  selectModo.innerHTML = ATTENTION_MODE_OPTIONS.map((m) => `<option value="${m}">${ATTENTION_MODE_LABEL_ES[m]}</option>`).join('');
  selectModo.value = c.attentionMode;

  await cargarResumenCliente(c.externalCustomerId);
}

document.getElementById('btn-autoasignar').addEventListener('click', async () => {
  try {
    await Api.assignConversation(conversationId, getAgent().id);
    mostrarToast('Conversación autoasignada', 'success');
    await abrirConversacion(conversationId);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  }
});
document.getElementById('btn-liberar').addEventListener('click', async () => {
  try {
    await Api.releaseConversation(conversationId);
    mostrarToast('Conversación liberada', 'success');
    await abrirConversacion(conversationId);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  }
});
document.getElementById('select-reasignar').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  try {
    await Api.assignConversation(conversationId, e.target.value);
    mostrarToast('Conversación reasignada', 'success');
    await abrirConversacion(conversationId);
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  } finally {
    e.target.value = '';
  }
});
document.getElementById('select-estado').addEventListener('change', async (e) => {
  try {
    await Api.updateStatus(conversationId, e.target.value);
    mostrarToast('Estado actualizado', 'success');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  }
});
document.getElementById('select-modo').addEventListener('change', async (e) => {
  try {
    await Api.updateAttentionMode(conversationId, e.target.value);
    mostrarToast('Modo de atención actualizado', 'success');
  } catch (err) {
    mostrarToast(err.message || 'No se pudo completar la acción', 'danger');
  }
});

const FINANCE_REASON_LABEL_ES = {
  not_configured: 'Integración financiera no configurada en este entorno',
  dependency_unavailable: 'El sistema financiero no respondió (dependencia no disponible)',
};

async function cargarResumenCliente(externalCustomerId) {
  try {
    const { data: resumen } = await Api.getCustomerSummary(externalCustomerId);
    const contConv = document.getElementById('detalle-conversaciones');
    contConv.innerHTML = resumen.conversations.length
      ? resumen.conversations
          .map((r) => `<div class="d-flex justify-content-between"><span>${STATUS_LABEL_ES[r.status] || r.status}</span><span class="font-monospace">${r.count}</span></div>`)
          .join('')
      : '<span class="text-secondary fst-italic">Sin historial de conversaciones.</span>';

    const contFin = document.getElementById('detalle-finanzas');
    if (!resumen.finance.available) {
      contFin.innerHTML = `<div class="alert alert-warning py-1 px-2 small mb-0"><i class="bi bi-exclamation-triangle"></i> Integración financiera no disponible. ${FINANCE_REASON_LABEL_ES[resumen.finance.reason] || resumen.finance.reason}</div>`;
    } else {
      contFin.innerHTML = '<span class="text-secondary">Ver pestaña Facturación para el detalle.</span>';
    }
  } catch {
    /* el resumen es informativo, no bloquea el resto del panel si falla */
  }
}

// ---- Notas internas ----
async function cargarNotas() {
  const { data: notas } = await Api.listNotes(conversationId);
  const cont = document.getElementById('lista-notas');
  if (!notas.length) {
    cont.innerHTML = '<p class="text-secondary small fst-italic">Sin notas todavía.</p>';
    return;
  }
  cont.innerHTML = notas
    .map((n) => {
      const esMia = n.authorAgentId === getAgent()?.id || n.author_agent_id === getAgent()?.id;
      return `<div class="nota-item rounded p-2 mb-2" data-note-id="${n.id}">
        <div class="d-flex justify-content-between">
          <span class="small">${escapeHtml(n.content)}</span>
          ${esMia ? '<button class="btn btn-sm btn-link text-danger p-0 btn-borrar-nota"><i class="bi bi-trash"></i></button>' : ''}
        </div>
        <div class="text-secondary" style="font-size:0.65rem;">${escapeHtml(n.authorName || n.author_name || 'Agente')} · ${new Date(n.createdAt || n.created_at).toLocaleString()}</div>
      </div>`;
    })
    .join('');
  cont.querySelectorAll('.btn-borrar-nota').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const noteId = btn.closest('[data-note-id]').dataset.noteId;
      try {
        await Api.deleteNote(conversationId, noteId);
        cargarNotas();
      } catch (err) {
        mostrarToast(err.message || 'No se pudo eliminar la nota', 'danger');
      }
    });
  });
}
document.getElementById('form-nota').addEventListener('submit', async (e) => {
  e.preventDefault();
  const textarea = document.getElementById('nota-texto');
  const contenido = textarea.value.trim();
  if (!contenido) return;
  try {
    await Api.createNote(conversationId, contenido);
    textarea.value = '';
    cargarNotas();
  } catch (err) {
    mostrarToast(err.message || 'No se pudo guardar la nota', 'danger');
  }
});

// ---------------------------------------------------------------
// Tiempo real: refresca lo que corresponda según el evento. Más simple que
// el CRM en React (que actualiza la caché de React Query en el sitio) --
// acá se re-pide por REST lo afectado, más fácil de seguir en una
// referencia sin un framework de estado de por medio.
// ---------------------------------------------------------------
// Hallazgo real: estas funciones son async pero se llamaban sin `await` ni
// `.catch()` en los handlers de socket -- si `cargarClientes`/`cargarMensajes`
// fallaba (permiso, red, lo que sea), quedaba como "unhandled promise
// rejection": invisible en pantalla, sin ningún aviso, solo un texto rojo en
// la consola del navegador que nadie mira. `onEventoRealtime` envuelve
// cualquier reacción a un evento de socket para que un fallo se vea siempre,
// en vez de "no llegó nada" sin ninguna pista de por qué.
function onEventoRealtime(nombreEvento, fn) {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(`[bandeja] fallo procesando evento de socket "${nombreEvento}":`, err);
      mostrarToast(`No se pudo actualizar la bandeja (${nombreEvento}): ${err.message}`, 'danger');
    });
}

SocketHandlers.onMessageCreated = (payload) => onEventoRealtime('conversation:message-created', async () => {
  const message = payload.message || payload;
  const convId = payload.conversationId || message.conversationId;
  if (convId === conversationId) await cargarMensajes(conversationId);
  await cargarClientes(true);
});
SocketHandlers.onMessageUpdated = (payload) => onEventoRealtime('conversation:message-updated', async () => {
  const message = payload.message || payload;
  const convId = payload.conversationId || message.conversationId;
  if (convId === conversationId) await cargarMensajes(conversationId);
});
SocketHandlers.onConversationCreated = () => onEventoRealtime('conversation:created', () => cargarClientes(true));
SocketHandlers.onReadUpdated = () => onEventoRealtime('conversation:read-updated', () => cargarClientes(true));
SocketHandlers.onAssigned = (payload) => onEventoRealtime('conversation:assigned', async () => {
  if (payload.conversationId === conversationId) await abrirConversacion(conversationId);
});
SocketHandlers.onStatusChanged = (payload) => onEventoRealtime('conversation:status-changed', async () => {
  await cargarClientes(true);
  if (payload.conversationId === conversationId) await abrirConversacion(conversationId);
});
SocketHandlers.onHandoff = () => onEventoRealtime('conversation:handoff', () => cargarClientes(true));

// ---------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------
conectarSocket();
cargarClientes(true);
actualizarVistaMovil();
