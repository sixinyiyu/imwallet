# rs-wallet Docker 镜像
# 多阶段构建 → distroless 最终镜像（~10MB）

FROM rust:1.95-slim-bookworm AS builder

WORKDIR /build

# 预构建依赖层（利用 Docker 缓存）
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src

# 复制源码
COPY src/ src/
COPY migrations/ migrations/

# 实际构建
RUN cargo build --release

# ── Runtime Stage ──
FROM gcr.io/distroless/cc-debian12:nonroot

WORKDIR /etc/rs-wallet

COPY --from=builder /build/target/release/rs-wallet /usr/local/bin/rs-wallet
COPY --from=builder /build/migrations/ /etc/rs-wallet/migrations/
# config.toml 不打包进镜像 — 所有配置通过环境变量传入
# 程序启动时 config.toml 找不到会使用默认值 + 环境变量覆盖

EXPOSE 3000

ENV DATABASE_URL=postgresql://imwallet:CHANGE_ME@db:5432/imwallet
ENV PORT=3000
ENV MIGRATION_DIR=/etc/rs-wallet/migrations

CMD ["rs-wallet"]