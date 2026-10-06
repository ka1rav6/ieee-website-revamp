#!/bin/sh
# Bring the schema up to date before serving. Migrations are idempotent, so
# this is safe on every container start, including rollouts and restarts.
set -e

echo "[entrypoint] applying database migrations"
alembic upgrade head

# The image installs the application's dependencies but not the application
# itself as a package, so the `ieee-content` and `ieee-admin` console scripts
# that `just` uses locally do not exist here. The modules behind them are run
# directly instead.
if [ "${CONTENT_IMPORT_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] importing content/"
    python -m app.content.cli import
fi

# Optional: ensure the single admin account exists. Requires ADMIN_PASSWORD.
if [ "${ADMIN_BOOTSTRAP_ON_START:-false}" = "true" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    echo "[entrypoint] ensuring administrator account"
    python -m app.cli.admin
fi

echo "[entrypoint] starting: $*"
exec "$@"
