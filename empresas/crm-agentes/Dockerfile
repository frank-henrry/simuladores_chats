# Módulo de chats para el sistema empresa (Bootstrap 5). Es HTML/JS plano,
# sin paso de build -- nginx solo sirve los archivos. CORE_API_URL/WS_URL se
# inyectan en el ARRANQUE del contenedor (no en build, a diferencia de
# frontend/Dockerfile con Vite), sustituyendo js/config.js desde su plantilla
# con envsubst -- así cambiar de URL no exige reconstruir la imagen.
FROM nginx:1.27-alpine

ENV CORE_API_URL=http://localhost:3002/api/v1
ENV WS_URL=http://localhost:3001

COPY . /usr/share/nginx/html
COPY docker-entrypoint-config.sh /docker-entrypoint.d/40-config.sh
RUN chmod +x /docker-entrypoint.d/40-config.sh

EXPOSE 80
