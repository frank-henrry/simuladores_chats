'use strict';

// Estado de la sesion actual, todo en memoria (esto es una demo).
let accessToken = null;
let coreApiUrl = null;
let conversationId = null;
let socket = null;

const $ = (id) => document.getElementById(id);

function log(msg) {
  const el = $('log');
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

async function pintarMensaje(msg) {
  const div = document.createElement('div');
  div.className = 'msg mb-2 pb-2 border-bottom';
  const quien = msg.senderType === 'customer' ? 'Cliente (yo)' : msg.senderType;
  const cuerpo = msg.type === 'document'
    ? `[archivo adjunto: ${(msg.attachments || []).map((a) => a.originalFilename).join(', ')}] ${msg.content || ''}`
    : msg.content;
  div.innerHTML = `<div class="meta">${quien} - ${new Date(msg.createdAt).toLocaleTimeString()}</div><div>${cuerpo}</div>`;
  $('mensajes').appendChild(div);
  $('mensajes').scrollTop = $('mensajes').scrollHeight;

  // Adjunto de audio: reproductor inline, igual que en el CRM. La descarga
  // exige Authorization (no se puede poner directo en <audio src>), así que
  // se trae el blob autenticado y se arma una URL local -- el mismo patrón
  // que usa el CRM (frontend/src/features/support/api/supportApi.ts,
  // getDocumentBlobUrl).
  const audioAttachment = (msg.attachments || []).find((a) => (a.mimeType || '').startsWith('audio/'));
  if (audioAttachment && audioAttachment.scanStatus === 'clean') {
    try {
      const res = await fetch(`${coreApiUrl}/documents/${audioAttachment.documentId}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;
      div.appendChild(audio);
    } catch (err) {
      log(`FALLO al cargar el audio para reproducir: ${err.message}`);
    }
  }
}

function habilitarChat(habilitado) {
  $('mensajeTexto').disabled = !habilitado;
  $('btnEnviar').disabled = !habilitado;
  $('archivo').disabled = !habilitado;
  $('categoriaArchivo').disabled = !habilitado;
  $('btnAdjuntar').disabled = !habilitado;
  $('btnGrabar').disabled = !habilitado;
  $('btnResolver').disabled = !habilitado;
}

// El <script src="http://localhost:3001/socket.io/socket.io.js"> del
// index.html se carga una sola vez, al abrir la página. Si en ese momento
// websocket-hub todavía no respondía, el script falla en silencio y `io`
// queda indefinido para siempre en esa pestaña. Este helper reintenta
// cargarlo bajo demanda.
function cargarSocketIoSiHaceFalta(wsPublicUrl) {
  if (typeof io !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${wsPublicUrl}/socket.io/socket.io.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(
      `No se pudo cargar socket.io.js desde ${wsPublicUrl} -- ¿está corriendo websocket-hub? (docker compose ps)`
    ));
    document.head.appendChild(script);
  });
}

$('btnIniciar').addEventListener('click', async () => {
  $('estadoConexion').textContent = 'iniciando...';
  const externalCustomerId = $('externalCustomerId').value.trim();
  const displayName = $('displayNameCliente').value.trim();

  try {
    // Paso 1: nuestro backend (chat-token.php) cambia la PORTAL_API_KEY por
    // un access token de cliente. El navegador NUNCA la ve. chat-sessions ya
    // crea/reutiliza el chat de este cliente y devuelve su id -- un solo
    // chat continuo por cliente, no hace falta "abrir" nada aparte
    // (implementacion/08-guia-integracion-portal.md#8.3).
    log(`POST /chat-token.php (nuestro backend PHP simulando al portal, displayName="${displayName}")...`);
    const sesionRes = await fetch('chat-token.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalCustomerId, displayName }),
    });
    const sesion = await sesionRes.json();
    if (!sesionRes.ok) throw new Error(JSON.stringify(sesion));
    accessToken = sesion.accessToken;
    coreApiUrl = sesion.coreApiUrl;
    conversationId = sesion.conversationId;
    log(`Access token de cliente obtenido (dura ${sesion.expiresIn}s). Chat: ${conversationId}`);

    // Paso 2: el navegador se conecta al WebSocket Hub con ese mismo access token.
    await cargarSocketIoSiHaceFalta(sesion.wsPublicUrl);
    socket = io(sesion.wsPublicUrl, { auth: { token: accessToken } });

    socket.on('connect', () => {
      log(`Socket conectado (id ${socket.id}).`);
      socket.emit('conversation:join', { conversationId }, (ack) => {
        if (ack && ack.ok) log('Unido a la sala de la conversacion.');
        else log(`ERROR al unirse a la sala: ${JSON.stringify(ack)}`);
      });
    });

    socket.on('connect_error', (err) => log(`ERROR de conexion socket: ${err.message}`));

    socket.on('conversation:message-created', (payload) => {
      log(`<- evento por socket: conversation:message-created (${payload.senderType})`);
      pintarMensaje(payload);
    });

    socket.on('conversation:status-changed', (payload) => {
      log(`<- evento por socket: conversation:status-changed -> ${payload.status}`);
    });

    $('estadoConexion').textContent = 'conectado';
    habilitarChat(true);
  } catch (err) {
    console.error(err);
    $('estadoConexion').textContent = 'error (ver consola/registro)';
    log(`FALLO: ${err.message}`);
  }
});

$('btnEnviar').addEventListener('click', async () => {
  const content = $('mensajeTexto').value.trim();
  if (!content) return;
  try {
    log('POST /conversations/:id/messages...');
    const res = await fetch(`${coreApiUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ clientMessageId: crypto.randomUUID(), content }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    $('mensajeTexto').value = '';
    log('Mensaje aceptado por el Core API (llegara por socket a todos los suscritos, incluido este mismo cliente).');
  } catch (err) {
    log(`FALLO al enviar mensaje: ${err.message}`);
  }
});

$('btnAdjuntar').addEventListener('click', async () => {
  const file = $('archivo').files[0];
  if (!file) return log('Selecciona un archivo primero.');
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('category', $('categoriaArchivo').value);
    form.append('clientMessageId', crypto.randomUUID());
    log('POST /conversations/:id/attachments (multipart)...');
    const res = await fetch(`${coreApiUrl}/conversations/${conversationId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    log('Adjunto aceptado por el Core API.');
  } catch (err) {
    log(`FALLO al adjuntar: ${err.message}`);
  }
});

// Grabación de audio (nota de voz) con la API MediaRecorder del navegador --
// el mismo patrón que tendría que implementar el portal real.
let mediaRecorder = null;
let audioChunks = [];

async function subirAudio(blob) {
  try {
    const form = new FormData();
    form.append('file', blob, `nota-de-voz-${Date.now()}.webm`);
    form.append('category', 'voice_note');
    form.append('clientMessageId', crypto.randomUUID());
    log('POST /conversations/:id/attachments (audio, multipart)...');
    const res = await fetch(`${coreApiUrl}/conversations/${conversationId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    log('Nota de voz aceptada por el Core API.');
  } catch (err) {
    log(`FALLO al mandar el audio: ${err.message}`);
  }
}

$('btnGrabar').addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      $('btnGrabar').textContent = '🎤 Grabar audio';
      $('estadoGrabacion').textContent = '';
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      await subirAudio(blob);
    };
    mediaRecorder.start();
    $('btnGrabar').textContent = '⏹ Detener y enviar';
    $('estadoGrabacion').textContent = 'grabando...';
  } catch (err) {
    log(`FALLO al acceder al micrófono: ${err.message}`);
  }
});

$('btnResolver').addEventListener('click', async () => {
  try {
    log('PATCH /portal/me/conversations/:id/resolve...');
    const res = await fetch(`${coreApiUrl}/portal/me/conversations/${conversationId}/resolve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body));
    log(`Marcado como resuelto (no cierra el chat). Estado: ${body.data.status}`);
  } catch (err) {
    log(`FALLO al resolver: ${err.message}`);
  }
});
