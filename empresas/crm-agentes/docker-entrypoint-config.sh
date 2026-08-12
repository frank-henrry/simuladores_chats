#!/bin/sh
set -e

envsubst '${CORE_API_URL} ${WS_URL}' \
  < /usr/share/nginx/html/js/config.js.template \
  > /usr/share/nginx/html/js/config.js
