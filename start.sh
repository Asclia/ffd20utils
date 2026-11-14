#!/usr/bin/env sh
# Inicia o FFd20 Utils e abre o navegador (Linux/macOS). Requer Node.js 18+.
cd "$(dirname "$0")" || exit 1
exec node server.js --open
