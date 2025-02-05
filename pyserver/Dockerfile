FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

RUN mkdir app
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

ENV IN_DOCKER_IMAGE=1

ENV PATH="${PATH}:/root/.local/bin"
ENV PYTHONPATH=.

COPY requirements.txt .
RUN uv pip install -r requirements.txt --no-cache-dir --system

COPY . .

COPY tests tests

RUN pytest tests

ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]