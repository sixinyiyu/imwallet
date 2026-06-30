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
mod utils;
// mod validators; — removed dead code

use log::Level;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};

static ALLOWED_HEADERS: &[&str] = &[
    "Content-Type",
    "Authorization",
    "x-device-id",
    "x-signature",
    "x-timestamp",
    "x-nonce",
    "x-app-version",
    "x-platform",
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. 加载配置（日志初始化需要它）
    let config = config::init_config()?;

    // 2. 初始化日志
    init_logger(&config);

    log::info!("rs-wallet starting...");

    // 3. 初始化数据库连接
    let db = Arc::new(db::init_db(&config.database_full_url())?);
    log::info!("Database connected ({})", config.database_masked_url());

    // 4. 执行数据库迁移（flyway 驱动 V*.sql，DDL + 种子数据一步完成）
    services::migrator::migrate(db.clone()).await?;

    // 4.1 同步 config.toml 配置到数据库（覆盖种子数据的默认值）
    services::config_service::sync_config_to_db(db.clone(), &config).await?;

    // 5. 构建路由（RSA 初始化、RuntimeConfig 转换、AppState 构建均在内部完成）
    let port = config.port;

    // 5.1 CORS 配置：permissive 模式回显任意 Origin，strict 模式仅允许白名单
    let cors_origin = if config.cors_permissive {
        // 开发模式：回显请求 Origin，允许任意来源（兼容 allow_credentials）
        log::warn!(
            "CORS permissive mode enabled — any origin is accepted. Do NOT use in production!"
        );
        AllowOrigin::mirror_request()
    } else {
        // 生产模式：仅允许配置文件中列出的来源
        AllowOrigin::list(
            config
                .cors_allowed_origins
                .iter()
                .map(|s| s.parse().unwrap())
                .collect::<Vec<_>>(),
        )
    };

    let app = routes::build_routes(db, config.clone()).await?.layer(
        CorsLayer::new()
            .allow_origin(cors_origin)
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