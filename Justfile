# IEEE IIIT Delhi website - developer interface.
# Run `just` or `just --list` to see everything available.

set dotenv-load := true
set dotenv-filename := ".env"
set dotenv-required := false

backend := "backend"
frontend := "frontend"
uv := "uv --project backend"

# Show all available recipes.
default:
    @just --list --unsorted

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

# One-time setup: .env, Python venv, node modules, database schema, content.
setup: env install db-up db-migrate content-import
    @echo ""
    @echo "Setup complete. Next:"
    @echo "  just admin   # create the single administrator account"
    @echo "  just dev     # start frontend + backend"

# Create .env from the template if it does not exist yet.
env:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f .env ]; then
        echo ".env already exists, leaving it untouched."
    else
        cp .env.example .env
        secret=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
        python3 - "$secret" <<'PY'
    import pathlib, sys
    p = pathlib.Path(".env")
    p.write_text(p.read_text().replace("SECRET_KEY=change-me-run-just-secret", f"SECRET_KEY={sys.argv[1]}"))
    PY
        echo "Created .env with a freshly generated SECRET_KEY."
        echo "Set ADMIN_PASSWORD in .env before running 'just admin'."
    fi

# Install backend and frontend dependencies.
install: install-backend install-frontend

# Install Python dependencies into backend/.venv.
install-backend:
    {{uv}} sync --all-extras

# Install node modules.
install-frontend:
    cd {{frontend}} && npm install

# Print a fresh random secret suitable for SECRET_KEY.
secret:
    @python3 -c 'import secrets; print(secrets.token_urlsafe(48))'

# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------

# Run backend and frontend together with live reload.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT INT TERM
    just backend &
    just frontend &
    wait

# Run the FastAPI backend with autoreload on :8000.
backend:
    {{uv}} run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir {{backend}}

# Run the Vite dev server on :5173.
frontend:
    cd {{frontend}} && npm run dev

# Run the whole stack in Docker exactly as production does, on :8000.
run: docker-build
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

# Start the Postgres container and wait until it accepts connections.
db-up:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose up -d postgres
    echo -n "Waiting for Postgres"
    for _ in $(seq 1 60); do
        if docker compose exec -T postgres pg_isready -q -U "${POSTGRES_USER:-ieee}" 2>/dev/null; then
            echo " ready."
            exit 0
        fi
        echo -n "."
        sleep 1
    done
    echo " timed out." >&2
    exit 1

# Stop the Postgres container (data is preserved in the volume).
db-down:
    docker compose stop postgres

# Open a psql shell on the development database.
db:
    docker compose exec postgres psql -U "${POSTGRES_USER:-ieee}" -d "${POSTGRES_DB:-ieee}"

# Apply all pending Alembic migrations.
db-migrate:
    cd {{backend}} && uv run alembic upgrade head

# Roll the database back by one migration.
db-rollback:
    cd {{backend}} && uv run alembic downgrade -1

# Autogenerate a migration from model changes: just db-migration "add x to y"
db-migration message:
    cd {{backend}} && uv run alembic revision --autogenerate -m "{{message}}"

# Show the migration the database is currently at.
db-current:
    cd {{backend}} && uv run alembic current

# Drop the database volume and rebuild it from migrations and content.
db-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    read -rp "This destroys all local database data. Continue? [y/N] " reply
    [[ "$reply" == [yY] ]] || { echo "Aborted."; exit 1; }
    docker compose down -v postgres
    just db-up db-migrate content-import

# ---------------------------------------------------------------------------
# Content (the scriptable way to update the site)
# ---------------------------------------------------------------------------

# Load everything under content/ into the database (idempotent upsert).
content-import:
    {{uv}} run ieee-content import

# Write the database back out to content/ so edits can be committed.
content-export:
    {{uv}} run ieee-content export

# Report what `just content-import` would change, without writing anything.
content-check:
    {{uv}} run ieee-content import --dry-run

# Validate content/ against the schemas without touching the database.
content-validate:
    {{uv}} run ieee-content validate

# Create or update the single administrator from ADMIN_EMAIL/ADMIN_PASSWORD.
admin:
    {{uv}} run ieee-admin

# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------

# Run every test suite.
test: test-backend test-frontend

# Run the pytest suite.
test-backend:
    {{uv}} run pytest

# Run the Vitest suite once.
test-frontend:
    cd {{frontend}} && npm run test

# Re-run frontend tests on change.
test-watch:
    cd {{frontend}} && npm run test:watch

# Backend tests with a coverage report.
coverage:
    {{uv}} run pytest --cov=app --cov-report=term-missing

# Lint everything.
lint: lint-backend lint-frontend

# Lint Python with ruff.
lint-backend:
    {{uv}} run ruff check backend
    {{uv}} run ruff format --check backend

# Lint TypeScript with eslint and prettier.
lint-frontend:
    cd {{frontend}} && npm run lint
    cd {{frontend}} && npm run format:check

# Autoformat and autofix everything.
format:
    {{uv}} run ruff check --fix backend
    {{uv}} run ruff format backend
    cd {{frontend}} && npm run format

# Type-check the frontend.
typecheck:
    cd {{frontend}} && npm run typecheck

# ---------------------------------------------------------------------------
# Build & deploy
# ---------------------------------------------------------------------------

# Build the production frontend bundle.
build:
    cd {{frontend}} && npm run build

# Build the single production Docker image.
docker-build:
    docker build -t ieee-iiitd-website:local .

# Run the production image against the compose Postgres.
docker-run: docker-build
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    @echo "Running on http://localhost:8000"

# Everything CI runs, in CI's order. Run this before pushing.
ci: lint typecheck test build docker-build

# Tail logs from the running containers.
logs:
    docker compose logs -f --tail=100

# Stop containers and remove build artifacts and caches.
clean:
    -docker compose down
    rm -rf {{frontend}}/dist {{frontend}}/node_modules/.vite
    find . -type d -name __pycache__ -prune -exec rm -rf {} +
    rm -rf .ruff_cache .pytest_cache {{backend}}/.ruff_cache {{backend}}/.pytest_cache

# Build and push the production image, then show the deploy checklist.
# Set REGISTRY and TAG; credentials come from the environment, never from git.
deploy registry=env_var_or_default("REGISTRY", "") tag=env_var_or_default("TAG", "latest"):
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{registry}}" ]; then
        echo "REGISTRY is not set. Example:" >&2
        echo "  REGISTRY=ghcr.io/ieee-iiit-delhi just deploy" >&2
        exit 1
    fi
    image="{{registry}}/ieee-iiitd-website:{{tag}}"
    docker build -t "$image" .
    docker push "$image"
    echo ""
    echo "Pushed $image"
    echo "See 'Deployment' in README.md for the rollout steps."
