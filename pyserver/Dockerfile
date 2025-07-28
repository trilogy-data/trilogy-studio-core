# Use multi-stage build for better optimization
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

# Set working directory
WORKDIR /app

# Set UV environment variables
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_CACHE_DIR=/tmp/uv-cache

# Copy requirements files first for better layer caching
COPY requirements.txt requirements-test.txt ./

# Install test dependencies and run tests
RUN uv pip install -r requirements-test.txt --no-cache-dir --system

# Copy source code and tests
COPY . .

# Run tests
RUN pytest tests

# Remove test dependencies and install only production dependencies
RUN uv pip uninstall $(uv pip freeze | grep -v -f requirements.txt | cut -d'=' -f1) --system || true
RUN uv pip install -r requirements.txt --no-cache-dir --system

# Production stage
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS production

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set working directory
WORKDIR /app

# Set environment variables
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV IN_DOCKER_IMAGE=1
ENV PYTHONPATH=.
ENV PORT=8080
ENV HOST=0.0.0.0

# Copy only production dependencies and app code from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app/*.py /app/
COPY --from=builder /app/requirements.txt /app/

# Change ownership to non-root user
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Use exec form for better signal handling
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]