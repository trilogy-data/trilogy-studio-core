# syntax=docker/dockerfile:1
# The remote query engine (Fly app `trilogy-engine`). Separate from pyserver:
# its own image, machines and secrets. See src/lib.rs.
#
# Build from the REPO ROOT: the engine depends on the explorer's query-bridge
# crate by path.
#
#   docker build -f engine/Dockerfile -t trilogy-engine .
#
# Dockerfile.dockerignore (next to this file) limits the context to the two
# crates.

ARG RUST_IMAGE=rust:1.97-slim-bookworm

FROM ${RUST_IMAGE} AS build
WORKDIR /src
COPY explorer/src-tauri/crates/query-bridge/Cargo.toml explorer/src-tauri/crates/query-bridge/Cargo.toml
COPY explorer/src-tauri/crates/query-bridge/src explorer/src-tauri/crates/query-bridge/src
COPY engine/Cargo.toml engine/Cargo.lock engine/
COPY engine/src engine/src
COPY engine/tests engine/tests
WORKDIR /src/engine
# Offline tests gate the image (the live suite skips without DATABRICKS_*).
# Same profile for both, so the build reuses the test compile.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/engine/target \
    cargo test --release --locked \
    && cargo build --release --locked \
    && cp target/release/trilogy-engine /usr/local/bin/trilogy-engine

# glibc + libgcc, no shell, no package manager, non-root. TLS roots are
# compiled in (rustls + webpki-roots), so no ca-certificates are needed.
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /usr/local/bin/trilogy-engine /usr/local/bin/trilogy-engine
ENV HOST=0.0.0.0 \
    PORT=8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/usr/local/bin/trilogy-engine"]
