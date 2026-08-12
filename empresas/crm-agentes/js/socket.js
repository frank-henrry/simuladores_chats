'use strict';

/**
 * Calcado de useRealtimeSync.ts (el CRM en React): un socket por sesión,
 * deduplicado por eventId (la entrega es "al menos una vez", 4.9), y
 * `SocketHandlers.on*` son callbacks que bandeja.js asigna para reaccionar.
 * `activeConversationId` decide si un mensaje nuevo dispara notificación
 * (si NO es la conversación que se está viendo ahora mismo) -- igual regla
 * que el CRM en React: solo mensajes de CLIENTE notifican, ni de agente ni de IA.
 */
let socket = null;
let activeConversationId = null;

function setActiveConversationId(id) {
  activeConversationId = id;
}

const SocketHandlers = {
  onConnect: null,
  onConversationCreated: null,
  onMessageCreated: null,
  onMessageUpdated: null,
  onReadUpdated: null,
  onAssigned: null,
  onStatusChanged: null,
  onHandoff: null,
  onAttachmentAvailable: null,
  onTypingStarted: null,
  onTypingStopped: null,
};

function conectarSocket() {
  socket = io(window.APP_CONFIG.WS_URL, { auth: { token: getAccessToken() } });

  const seen = new Set();
  const MAX_SEEN = 500;
  function shouldProcess(payload) {
    const id = payload && payload.eventId;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > MAX_SEEN) {
      const oldest = seen.values().next().value;
      seen.delete(oldest);
    }
    return true;
  }

  socket.on('connect', () => SocketHandlers.onConnect && SocketHandlers.onConnect());

  socket.on('conversation:created', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onConversationCreated && SocketHandlers.onConversationCreated(p);
  });

  socket.on('conversation:message-created', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onMessageCreated && SocketHandlers.onMessageCreated(p);

    const message = p.message || p;
    const conversationId = p.conversationId || message.conversationId;
    const viendoloAhora = conversationId && conversationId === activeConversationId;
    if (conversationId && !viendoloAhora && message.senderType === 'customer') {
      notificarMensajeNuevo(conversationId, message.senderId, message.content);
    }
  });

  socket.on('conversation:message-updated', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onMessageUpdated && SocketHandlers.onMessageUpdated(p);
  });

  socket.on('conversation:read-updated', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onReadUpdated && SocketHandlers.onReadUpdated(p);
  });

  socket.on('conversation:assigned', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onAssigned && SocketHandlers.onAssigned(p);
  });

  socket.on('conversation:status-changed', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onStatusChanged && SocketHandlers.onStatusChanged(p);
  });

  socket.on('conversation:handoff', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onHandoff && SocketHandlers.onHandoff(p);
    mostrarToast('Una conversación requiere atención humana', 'warning');
  });

  socket.on('attachment:available', (p) => {
    if (!shouldProcess(p)) return;
    SocketHandlers.onAttachmentAvailable && SocketHandlers.onAttachmentAvailable(p);
  });

  socket.on('typing:started', (p) => SocketHandlers.onTypingStarted && SocketHandlers.onTypingStarted(p));
  socket.on('typing:stopped', (p) => SocketHandlers.onTypingStopped && SocketHandlers.onTypingStopped(p));

  return socket;
}

function unirseAConversacion(conversationId, callback) {
  if (!socket) return;
  socket.emit('conversation:join', { conversationId }, callback);
}
