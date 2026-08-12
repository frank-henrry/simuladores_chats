# Módulo de Chats — sistema empresa (Bootstrap 5)

Réplica funcional completa del CRM de soporte (`frontend/`, React) pensada
para insertarse como un módulo nuevo dentro del "sistema empresa" existente,
que trabaja con **Bootstrap 5**. Es un frontend puramente estático (sin
backend propio): habla directo contra el mismo `servicio-core-api` que ya
usa el CRM en React y el portal del cliente.

## Por qué existe

El "sistema empresa" (donde el personal gestiona a sus clientes) va a tener
su propio módulo de chats, embebido en su front en Bootstrap 5 -- no React.
Este proyecto es la referencia/plantilla de ese módulo: mismo comportamiento,
mismos endpoints, mismas reglas, pero en JS plano + Bootstrap 5, para que se
pueda copiar/adaptar directamente dentro del front real de la empresa.

El CRM en React (`frontend/`) **no se elimina** -- sigue siendo el sistema
que usamos nosotros. Este módulo es la traducción de ese mismo CRM a
Bootstrap 5, componente por componente.

## Autenticación

Cada agente entra con su propia cuenta (tabla `support.agents`), con el
mismo `POST /auth/agent-login` que ya usa el CRM en React -- no hay
intercambio de sesión (SSO) con el sistema empresa, es un login
independiente. El token (24h) se guarda en `localStorage`. Los permisos
reales viven dentro del JWT y los aplica el Core en cada endpoint
(`requirePermission`); el `role` que devuelve el login se usa **solo** como
pista de UI para no ofrecer botones que el backend va a rechazar (ver
`js/auth.js`, `isSupervisorOrAdmin()`) -- igual que hace `AssignmentPanel.tsx`
en el CRM en React. La autorización real nunca es del lado del cliente.

## Mapa de archivos (Bootstrap 5) ↔ componentes (React)

| Este proyecto | CRM en React | Qué hace |
|---|---|---|
| `index.html` | `LoginPage` (dentro de `App.tsx`) | Login de agente |
| `js/auth.js` | `useAuth` / lógica de sesión | Guardar/leer token, `isSupervisorOrAdmin()` |
| `js/api.js` | `features/support/api/supportApi.ts` | Todas las llamadas al Core, 1:1 |
| `js/labels.js` | `features/support/labels.ts` | Traducciones ES + colores de badges |
| `js/socket.js` | `hooks/useRealtimeSync.ts` | Conexión Socket.IO, dedupe por `eventId` |
| `js/notificaciones.js` | `useNotificationsStore.ts` + `NotificationBell.tsx` | Campanita, toast, sonido, `Notification` nativa |
| `pages/bandeja.html` + `js/bandeja.js` | `InboxPage.tsx` + `CustomerList.tsx` + `ConversationView.tsx` + `MessageBubble.tsx` + `MessageComposer.tsx` + `ConversationSidePanel.tsx` + `AssignmentPanel.tsx` + `CustomerPanel.tsx` + `NotesPanel.tsx` + `ResolveButton.tsx` | Bandeja completa: lista de clientes, chat, adjuntos/audio, eliminar mensaje, asignación/estado/modo, cliente y pagos, notas |
| `pages/facturacion.html` + `js/facturacion.js` | `InvoicesPage.tsx` | Tabla de facturas (`support.invoices`, aparte del chat) |
| `pages/auditoria.html` + `js/auditoria.js` | `AuditPage.tsx` | Vista simple de `support.audit_events` |

## Diferencias deliberadas frente al CRM en React

Esto es una *referencia*, no busca calcar la arquitectura interna de React
(React Query, caché normalizada, etc.) sino el comportamiento que ve el
agente. Simplificaciones a propósito, para que el código sea fácil de
adaptar sin arrastrar un framework de estado:

- **Sin caché ni actualizaciones "in place" finas**: cuando llega un evento
  de socket relevante (mensaje nuevo, mensaje editado/eliminado, cambio de
  estado), se vuelve a pedir por REST lo que cambió (mensajes de la
  conversación abierta, o la lista de clientes) en vez de parchear el DOM
  mensaje por mensaje. Es más simple de seguir y sigue siendo instantáneo
  para el agente; el costo es una llamada HTTP de más por evento.
- **Notificación de mensaje nuevo**: se dispara solo cuando el mensaje es
  de tipo `customer` y la conversación no es la que está abierta en ese
  momento -- misma regla que el CRM en React (nunca notifica mensajes
  propios ni de la IA).
- **Sin service worker / push real**: la notificación nativa del navegador
  (`Notification`) solo aparece si la pestaña está oculta y el usuario ya
  dio permiso; no hay push cuando el navegador está cerrado.

## Reglas de negocio que hay que respetar si se porta esto al front real

- **Eliminar mensaje**: solo lo puede borrar quien lo envió
  (`sender_type`/`sender_id` deben matchear al agente logueado); el backend
  ya lo valida, pero el botón de borrar en la UI también se oculta si el
  mensaje no es propio (`bandeja.js`, `construirBurbuja`). Es "eliminar para
  todos" -- no hay borrado solo-local.
- **Modo de atención IA/Humano**: al presionar "Marcar resuelto" se pone
  `status=resolved` **y** `attentionMode=ai`; esto reinicia la ventana de
  contexto que ve la IA la próxima vez que el cliente escriba (columna
  `ai_context_since` en `support.conversations`), sin borrar el historial.
- **Facturación totalmente separada del chat**: `support.invoices` no toca
  `support.conversations` ni `support.messages` -- las facturas llegan por
  `POST /integration/invoices` (el sistema de facturación de la empresa),
  nunca por el chat. La pestaña de Facturación es la única forma de verlas
  y marcarlas como pagadas.
- **Permisos nuevos y sesiones viejas**: si se agrega un permiso nuevo
  (`invoice:read`, etc.) a un rol, los agentes que ya tenían sesión abierta
  ANTES de ese cambio no lo tienen en su token hasta que vuelvan a entrar.
  Por eso `facturacion.js` y `auditoria.js` distinguen explícitamente un
  403 ("te falta el permiso, vuelve a entrar") de una lista vacía real.

## Cómo probarlo

Es estático -- no necesita build ni servidor propio. Basta con:

```bash
cd modulo-chats-sistema-empresa
python3 -m http.server 8090
```

y abrir `http://localhost:8090/`, con el stack de `servicio-core-api`
corriendo y `js/config.js` apuntando a sus URLs (`CORE_API_URL`, `WS_URL`).
Como el Core valida CORS/orígenes, hay que asegurarse de que el puerto que
se use esté permitido en su configuración (mismo mecanismo que ya usa el
CRM en React o el portal de cliente para probarse localmente).
