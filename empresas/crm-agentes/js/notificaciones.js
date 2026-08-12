'use strict';

/**
 * Calcado de useRealtimeSync.ts + useNotificationsStore.ts + NotificationBell.tsx
 * (el CRM en React): toast efímero + sonido + notificación nativa del
 * navegador (avisan en el momento) MÁS una lista persistente en la
 * campanita del encabezado (se queda hasta que el agente la revise).
 * Solo vive en memoria de la pestaña -- no hace falta más que eso, es un
 * aviso de "algo pasó", no un historial.
 */
const Notificaciones = {
  items: [], // { id, conversationId, externalCustomerId, preview, createdAt, leida }

  agregar({ conversationId, externalCustomerId, preview }) {
    this.items.unshift({
      id: crypto.randomUUID(),
      conversationId,
      externalCustomerId,
      preview: preview || '(sin texto -- ver adjunto)',
      createdAt: new Date().toISOString(),
      leida: false,
    });
    if (this.items.length > 50) this.items.length = 50;
    this._render();
  },

  marcarLeida(id) {
    const it = this.items.find((n) => n.id === id);
    if (it) it.leida = true;
    this._render();
  },

  marcarTodoLeido() {
    this.items.forEach((n) => (n.leida = true));
    this._render();
  },

  _render() {
    const lista = document.getElementById('lista-notificaciones');
    const badge = document.getElementById('badge-notif');
    if (!lista || !badge) return;

    const noLeidas = this.items.filter((n) => !n.leida).length;
    if (noLeidas > 0) {
      badge.textContent = noLeidas > 99 ? '99+' : String(noLeidas);
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }

    if (this.items.length === 0) {
      lista.innerHTML = '<li class="text-secondary small px-2">Sin notificaciones todavía.</li>';
      return;
    }

    lista.innerHTML = this.items
      .map(
        (n) => `
      <li>
        <a href="#" class="dropdown-item ${n.leida ? 'opacity-50' : ''}" data-notif-id="${n.id}" data-conversation-id="${n.conversationId}">
          <div class="d-flex justify-content-between">
            <strong class="small">${escapeHtml(n.externalCustomerId || 'Cliente')}</strong>
            <span class="text-secondary" style="font-size:0.65rem;">${new Date(n.createdAt).toLocaleTimeString()}</span>
          </div>
          <div class="small text-truncate text-secondary">${escapeHtml(n.preview)}</div>
        </a>
      </li>`
      )
      .join('');

    lista.querySelectorAll('[data-notif-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.marcarLeida(el.dataset.notifId);
        if (window.abrirCliente) window.abrirCliente(null, el.dataset.conversationId);
      });
    });
  },
};

function reproducirSonidoNotificacion() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    /* sin soporte de audio, no es crítico */
  }
}

function mostrarToast(mensaje, variante = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${variante} border-0 mb-2`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="d-flex">
    <div class="toast-body small">${escapeHtml(mensaje)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
  </div>`;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function notificarMensajeNuevo(conversationId, externalCustomerId, preview) {
  Notificaciones.agregar({ conversationId, externalCustomerId, preview });
  mostrarToast(`Nuevo mensaje de ${externalCustomerId || 'cliente'}: ${preview || ''}`, 'primary');
  reproducirSonidoNotificacion();

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(`Nuevo mensaje de ${externalCustomerId || 'cliente'}`, {
        body: preview || undefined,
        tag: 'modulo-chats-nuevo-mensaje',
      });
    } catch {
      /* algunos navegadores/contextos pueden rechazarlo, no es crítico */
    }
  }
}

if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => {});
}

document.getElementById('btn-logout')?.addEventListener('click', logout);
