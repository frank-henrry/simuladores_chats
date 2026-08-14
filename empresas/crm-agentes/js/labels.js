'use strict';

/**
 * Traducciones y colores, calcados de frontend/src/features/support/labels.ts
 * (el CRM en React) -- el backend sigue hablando en inglés, esto es solo
 * para mostrar. Las clases de color son de Bootstrap 5 (badge bg-*) más
 * unas pocas propias (badge-purple/badge-cyan) definidas en css/estilos.css
 * para los estados que Bootstrap no trae de fábrica.
 */
const STATUS_LABEL_ES = {
  open: 'Abierto',
  waiting_ai: 'Esperando IA',
  waiting_support: 'Esperando soporte',
  waiting_customer: 'Esperando cliente',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const STATUS_BADGE_CLASS = {
  open: 'badge bg-success-subtle text-success-emphasis border border-success-subtle',
  waiting_ai: 'badge badge-purple',
  waiting_support: 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle',
  waiting_customer: 'badge badge-cyan',
  resolved: 'badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle',
  closed: 'badge bg-dark-subtle text-dark-emphasis border border-dark-subtle',
};

const ATTENTION_MODE_LABEL_ES = {
  ai: 'IA',
  human: 'Humano',
  hybrid: 'Híbrido',
};

const ATTENTION_MODE_BADGE_CLASS = {
  ai: 'badge badge-purple',
  human: 'badge bg-success-subtle text-success-emphasis border border-success-subtle',
  hybrid: 'badge badge-cyan',
};

const ROLE_LABEL_ES = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Agente',
};

const INVOICE_STATUS_LABEL_ES = {
  pending: 'Pendiente',
  paid: 'Pagada',
};

const INVOICE_STATUS_BADGE_CLASS = {
  pending: 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle',
  paid: 'badge bg-success-subtle text-success-emphasis border border-success-subtle',
};

const SENDER_LABEL_ES = {
  customer: 'Cliente',
  support_agent: 'Agente',
  ai: 'IA',
  system: 'Sistema',
};

const SCAN_STATUS_LABEL_ES = {
  pending: 'Pendiente de verificación',
  clean: 'Verificado',
  rejected: 'Rechazado por el antivirus',
  failed: 'Falló el escaneo',
};

/**
 * Adelanto de "último mensaje" al estilo WhatsApp -- igual que
 * messagePreviewLabel() en labels.ts. Cuando el último mensaje es un
 * adjunto sin texto (lo normal), arma algo legible sin abrir el chat.
 */
// 'image'/'audio'/'file' según el mime real (deriveMessageType en el
// backend); 'document' se mantiene solo por mensajes de antes de ese cambio.
const ATTACHMENT_MESSAGE_TYPES = ['image', 'audio', 'file', 'document'];

function messagePreviewLabel({ messageType, attachmentCategory, attachmentMime, content }) {
  if (ATTACHMENT_MESSAGE_TYPES.includes(messageType)) {
    if (messageType === 'audio' || attachmentCategory === 'voice_note' || (attachmentMime || '').startsWith('audio/')) return '🎤 Audio';
    if (messageType === 'image' || (attachmentMime || '').startsWith('image/')) return '📷 Foto';
    if (attachmentMime === 'application/pdf') return '📄 Documento';
    if (attachmentCategory === 'payment_receipt') return '💳 Comprobante de pago';
    return content ? `📎 ${content}` : '📎 Adjunto';
  }
  if (messageType === 'payment_event') return content ? `💳 ${content}` : '💳 Reporte de pago';
  return content || 'Sin mensajes todavía';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
