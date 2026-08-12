'use strict';

/**
 * Único lugar que hay que tocar al integrar esto en el sistema empresa real:
 * apunten CORE_API_URL/WS_URL a donde esté publicado nuestro Core API y
 * WebSocket Hub (mismo valor que ya usa el CRM en React -- VITE_API_URL /
 * VITE_WS_URL). No hay más configuración: el navegador le habla directo al
 * Core API, no hace falta backend propio para este módulo.
 *
 * Este archivo es el que se usa al abrir el proyecto suelto (sin Docker,
 * ej. `python3 -m http.server`). Dentro del contenedor (ver Dockerfile /
 * docker-entrypoint-config.sh) se SOBRESCRIBE al arrancar, generado desde
 * config.js.template con las variables de entorno CORE_API_URL/WS_URL del
 * servicio -- no edites ese template pensando que este archivo manda ahí.
 */
window.APP_CONFIG = {
  CORE_API_URL: 'http://localhost:3002/api/v1',
  WS_URL: 'http://localhost:3001',
};
