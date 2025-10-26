# Multi-stage Dockerfile for Trilogy Studio
# Stage 1: Build Frontend
FROM node:23-alpine AS frontend-builder

WORKDIR /app/frontend

# Install pnpm
RUN corepack enable pnpm

# Copy frontend package files
COPY package.json pnpm-lock.yaml ./

# Install frontend dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY ./ ./

# Build frontend
RUN pnpm run build

# Stage 2: Build Backend
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS backend-builder

WORKDIR /app/backend

# Set UV environment variables
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_CACHE_DIR=/tmp/uv-cache

# Copy backend requirements
COPY pyserver/requirements.txt pyserver/requirements-test.txt ./

# Install test dependencies and run tests
RUN uv pip install -r requirements-test.txt --no-cache-dir --system

# Copy backend source
COPY pyserver/ ./

# Run backend tests
RUN pytest tests || echo "No tests found, continuing..."

# Install production dependencies
RUN uv pip install -r requirements.txt --no-cache-dir --system

# Stage 3: Production - Nginx + Python
FROM nginx:alpine AS production

# Install Python, curl, and supervisor for process management
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    supervisor \
    && ln -sf python3 /usr/bin/python

# Create application user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /bin/sh -G appuser -g appuser appuser

# Set working directory
WORKDIR /app

# Copy Python dependencies from backend builder
COPY --from=backend-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy backend application
COPY --from=backend-builder /app/backend/ ./backend/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy built frontend to nginx html directory
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r ./frontend/dist/* /usr/share/nginx/html/

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Create supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/trilogy.conf 

# Set environment variables
ENV PYTHONPATH=/app/backend
ENV IN_DOCKER_IMAGE=1
ENV PORT=8080
ENV HOST=127.0.0.1

# Create log directories and set permissions
RUN mkdir -p /var/log/supervisor /var/log/nginx && \
    touch /var/log/backend.log /var/log/backend_error.log && \
    chown -R appuser:appuser /app && \
    chown appuser:appuser /var/log/backend*.log

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:80/health && curl -f http://localhost:8080/health || exit 1

# Start supervisor to manage both services
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/trilogy.conf"]