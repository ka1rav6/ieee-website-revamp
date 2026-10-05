# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the React bundle.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Served from the same origin as the API in production, so the browser can
# use relative /api/v1 paths and no base URL is needed.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Python dependencies.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS backend-deps
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /bin/uv
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# Dependencies change far less often than source, so resolve them first and
# let Docker cache the layer.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

# ---------------------------------------------------------------------------
# Stage 3: runtime.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    STATIC_DIR=/app/static \
    UPLOAD_DIR=/data/uploads

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data

WORKDIR /app

COPY --from=backend-deps /opt/venv /opt/venv
COPY backend/pyproject.toml backend/alembic.ini ./
COPY backend/app ./app
COPY backend/alembic ./alembic
# Content lives in the image so `ieee-content import` works inside the
# container during a release.
COPY content ./content
COPY --from=frontend /build/dist ./static
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
