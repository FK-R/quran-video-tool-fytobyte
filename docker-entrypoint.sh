#!/bin/sh
set -e
mkdir -p "${STORAGE_DIR:-/data}"
echo "Applying database migrations..."
node_modules/.bin/prisma migrate deploy
echo "Starting Next.js on port ${PORT:-3000}"
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
