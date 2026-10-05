#!/bin/sh
# Bring the schema up to date before serving. Migrations are idempotent, so
# this is safe on every container start, including rollouts and restarts.
set -e

echo "[entrypoint] applying database migrations"
alembic upgrade head

# Optional: seed/refresh content from the version-controlled content/ tree.
# Off by default so a deploy never silently overwrites admin edits.
if [ "${CONTENT_IMPORT_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] importing content/"
    ieee-content import
fi

# Optional: ensure the single admin account exists. Requires ADMIN_PASSWORD.
if [ "${ADMIN_BOOTSTRAP_ON_START:-false}" = "true" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    echo "[entrypoint] ensuring administrator account"
    ieee-admin
fi

echo "[entrypoint] starting: $*"
exec "$@"
