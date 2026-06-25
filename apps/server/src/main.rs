//! rs-wallet 服务入口
//! 迁移自 IMWallet src/index.ts
//!
//! 启动顺序：
//! 1. 加载配置
//! 2. 初始化日志（simple_logger，级别来自 config.toml）
//! 3. 初始化数据库连接
//! 4. 执行数据库迁移（含种子数据，由 flyway 驱动）
//! 5. 构建路由 + 启动 HTTP 服务

mod chain;
mod config;
mod db;
mod errors;
mod middleware;
mod models;
mod routes;
mod services;
// mod validators; — removed dead code

use log::Level;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

static ALLOWED_ORIGINS: &[&str] = &[
    "https://imwallet.dpdns.org",
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:3000",
];

static ALLOWED_HEADERS: &[&str] = &[
    "Content-Type",
    "Authorization",
    "x-device-id",
    "x-signature",
    "x-timestamp",
    "x-nonce",
    "x-app-version",
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. 加载配置（日志初始化需要它）
    let config = config::init_config()?;

    // 2. 初始化日志
    init_logger(&config);

    log::info!("rs-wallet starting...");

    // 3. 初始化数据库连接
    let db = Arc::new(db::init_db(&config.database_url)?);
    log::info!("Database connected");

    // 4. 执行数据库迁移（flyway 驱动 V*.sql，DDL + 种子数据一步完成）
    services::migrator::migrate(db.clone()).await?;

    // 4.1 同步 config.toml 配置到数据库（覆盖种子数据的默认值）
    services::config_service::sync_config_to_db(db.clone(), &config).await?;

    // 5. 构建路由（RSA 初始化、RuntimeConfig 转换、AppState 构建均在内部完成）
    let port = config.port;
    let app = routes::build_routes(db, config).await?.layer(
        CorsLayer::new()
            .allow_origin(
                ALLOWED_ORIGINS
                    .iter()
                    .map(|s| s.parse().unwrap())
                    .collect::<Vec<_>>(),
            )
            .allow_methods([
                axum::http::Method::GET,
                axum::http::Method::POST,
                axum::http::Method::PUT,
                axum::http::Method::DELETE,
                axum::http::Method::OPTIONS,
            ])
            .allow_headers(
                ALLOWED_HEADERS
                    .iter()
                    .map(|s| s.parse().unwrap())
                    .collect::<Vec<_>>(),
            )
            .allow_credentials(true),
    );

    // 6. 启动 HTTP 服务
    let addr = format!("0.0.0.0:{}", port);
    log::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// 用 simple_logger 初始化日志，级别从 config.toml [logging] 读取
fn init_logger(cfg: &config::AppConfig) {
    let level: Level = cfg.log_default_level.parse().unwrap_or(Level::Info);
    simple_logger::init_with_level(level).expect("Failed to initialize logger");
}
