# Demo: portal externo conectándose al chat (paso a paso)

Este proyecto **no es parte de `virtualfact_chats`** — vive aparte a propósito, para no tocar ni arriesgar ese repositorio. Es la implementación más simple posible de lo que describe `implementacion/08-guia-integracion-portal.md` (dentro de `virtualfact_chats`): un portal externo que se conecta al chat continuo de un cliente (uno solo por cliente, no "tickets" ni "reportes") y manda mensajes/comprobantes.

Sirve para dos cosas:
1. **Probar hoy mismo** que la integración funciona de verdad, sin esperar a que el otro equipo la programe.
2. **Dárselo a ese equipo** como referencia: es exactamente lo que tienen que construir, solo que aquí está reducido a lo mínimo (sin su framework, sin su base de datos de clientes, sin estilos).

**Esto es SOLO el chat del cliente.** El sistema empresas (facturación y el módulo de agentes) es OTRO integrador, con su propia llave y su propio backend donde le corresponde — ver `../empresas/` (carpeta hermana, mismo `docker-compose.yml`).

## Cómo está armado

```
portal-cliente-demo/               <- carpeta contenedora, dos proyectos externos distintos
├── docker-compose.yml             <- levanta los tres servicios juntos
├── cliente/                       <- ESTE proyecto (portal donde escribe el cliente), PHP + Bootstrap
│   ├── chat-token.php             <- el "backend del portal" (la única pieza que conoce la llave)
│   ├── index.html                 <- la pantalla de chat
│   ├── app.js                      <- toda la lógica del navegador
│   ├── Dockerfile                  <- php:8.2-apache
│   └── .env                        <- config local (no se sube a ningún repositorio)
└── empresas/                      <- otro proyecto, ver su propio README.md en cada subcarpeta
    ├── facturacion/                <- backend de facturación (manda/lee facturas), también PHP
    └── crm-agentes/                <- módulo Bootstrap del personal, sin backend propio
```

## Paso a paso de la implementación

### Paso 1 — el backend cambia una llave por un token de cliente (`chat-token.php`)

El equipo de `virtualfact_chats` les entrega una `PORTAL_API_KEY` por un canal seguro. Esa llave **solo vive en el backend** (nunca en el navegador). No es un JWT, no se firma nada -- es un valor fijo que se manda tal cual en el header `Authorization` y se cambia por un `accessToken` a nombre de un cliente específico:

```php
// chat-token.php
$ch = curl_init($coreApiInternalUrl . '/integration/chat-sessions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['externalCustomerId' => $_SESSION['ruc'], 'displayName' => $_SESSION['razon_social']]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $portalApiKey],
]);
$response = curl_exec($ch);
```

El `externalCustomerId` es el ID que **ustedes** ya usan para ese cliente (su RUC, su ID interno — lo que sea, mientras sea estable), en texto plano, sin cifrar. El backend le devuelve al navegador el `accessToken` **y el `conversationId`** — nunca la `PORTAL_API_KEY`.

**No hace falta "abrir" un chat aparte.** `chat-sessions` ya crea (la primera vez) o reutiliza (siempre después) el único chat continuo de ese cliente y devuelve su `conversationId` directo en la respuesta del Paso 1 — con eso el navegador ya puede listar mensajes, mandar mensajes y conectarse al socket.

### Paso 2 — el navegador se conecta al WebSocket y se une a la sala

```js
socket = io(wsPublicUrl, { auth: { token: accessToken } });
socket.on('connect', () => {
  socket.emit('conversation:join', { conversationId }, (ack) => { /* ack.ok */ });
});
socket.on('conversation:message-created', (payload) => { /* pintar en pantalla */ });
```

El script del cliente de Socket.IO se carga directo desde el propio Hub (`<script src="http://localhost:3001/socket.io/socket.io.js">` en `index.html`) — en un proyecto real normalmente se instala como paquete npm (`socket.io-client`) en vez de cargarlo así, esto es solo para no necesitar un empaquetador en esta demo.

### Paso 3 — mandar mensajes y comprobantes de pago (REST, no por el socket)

```js
// texto
await fetch(`${coreApiUrl}/conversations/${conversationId}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ clientMessageId: crypto.randomUUID(), content }),
});

// archivo (captura de pago)
const form = new FormData();
form.append('file', file);
form.append('category', 'payment_receipt');
form.append('clientMessageId', crypto.randomUUID());
await fetch(`${coreApiUrl}/conversations/${conversationId}/attachments`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

El mensaje/archivo enviado le llega de vuelta a este mismo navegador **por el socket** (`conversation:message-created`), porque está unido a la sala — así es como se ve en tiempo real sin recargar.

### Paso 4 — el cliente marca que ya no necesita ayuda por ahora (opcional)

```js
await fetch(`${coreApiUrl}/portal/me/conversations/${conversationId}/resolve`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

Esto **no cierra el chat** -- es solo informativo. El cliente puede seguir escribiendo en el mismo `conversationId` cuando quiera, hoy o meses después.

### Paso 5 — renovar el token ANTES de que expire, y reconectar el socket (crítico, no opcional)

**Hallazgo real de un integrador probando esto:** renovar solo el `accessToken` para las llamadas REST no alcanza. El socket sigue conectado con el token viejo -- cuando ese token vence, el socket se cae, y las respuestas del agente dejan de llegar en vivo aunque el REST puntual (con un token fresco) siga funcionando. Por eso `app.js` (`conectarChat()`) **siempre reconecta el socket** al renovar, no solo pide un token nuevo:

```js
async function conectarChat(externalCustomerId, displayName) {
  const sesion = await obtenerSesionChat(...); // su propio backend
  accessToken = sesion.accessToken;

  if (socket) socket.disconnect(); // suelta el socket viejo
  socket = io(sesion.wsPublicUrl, { auth: { token: accessToken } });
  // ...volver a registrar los listeners y hacer conversation:join...

  // Renovar proactivamente un minuto antes de que expire.
  setTimeout(() => conectarChat(externalCustomerId, displayName), (sesion.expiresIn - 60) * 1000);
}
```

Además, cualquier llamada REST debe manejar un 401 renovando y reintentando (por si el timer no alcanzó a dispararse a tiempo) -- ver `fetchConReintento()` en `app.js`.

## Cómo correrlo

Primero, siempre, tiene que estar levantado el stack de `virtualfact_chats` (`docker compose up -d` desde esa carpeta) — este demo depende de su red.

```
cd portal-cliente-demo
cp cliente/.env.example cliente/.env   # completar PORTAL_API_KEY
docker compose up -d --build
```

El `docker-compose.yml` (en la raíz de `portal-cliente-demo/`) es **propio de esta carpeta**, separado del de `virtualfact_chats` — pero se une a la red `support_public` que ese proyecto ya crea (`external: true` en la sección `networks:`), así los contenedores de la demo pueden llamar a `core-api` y `websocket-hub` por su nombre de servicio en vez de `localhost`. Si el nombre de esa red no coincide en tu máquina (por ejemplo, si la carpeta de `virtualfact_chats` se llama distinto), `docker network ls` te muestra el nombre real y lo ajustas en `VIRTUALFACT_NETWORK` o directo en el `docker-compose.yml` de esta demo. `docker compose up -d --build` levanta los tres servicios (cliente, empresas-facturacion, empresas-crm-agentes) juntos. Adentro del contenedor corre Apache + PHP (`php:8.2-apache`), escuchando en el :80 interno, publicado en `:4000`.

Abrir `http://localhost:4000` en el navegador, llenar el `externalCustomerId` y usar la pantalla. El recuadro de "Registro técnico" muestra cada llamada que se hace, para poder seguir el flujo paso a paso.

> Nota: `PORTAL_ORIGIN` en `virtualfact_chats/servicio-core-api/.env` y `virtualfact_chats/servicio-websocket/.env` ya está en `http://localhost:4000` por defecto — por eso el CORS del Core API y del Hub dejan pasar a este demo sin configurar nada más. Si ustedes corren este demo en otro puerto o dominio, hay que avisarle al equipo de `virtualfact_chats` para que agregue ese origen en esos dos archivos.

## Qué NO copiar tal cual

Esto es una demo de un solo archivo por capa, sin manejo de errores robusto, sin reintentos, sin persistencia de sesión. Para el proyecto real del otro equipo: guardar el `accessToken` con su expiración y renovarlo desde su propio backend cuando venza (dura 15 minutos), manejar reconexión del socket, y — más importante — **recargar el historial por REST (`GET /conversations/:id/messages`) después de cada reconexión**, porque el socket nunca es la única fuente de verdad.

## Referencia completa

Todo el contrato (endpoints, eventos, códigos de error, límites) está en `implementacion/08-guia-integracion-portal.md` dentro del repositorio `virtualfact_chats`. Esta demo es el complemento práctico de esa guía, no su reemplazo.
