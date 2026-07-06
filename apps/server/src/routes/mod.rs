//! 路由层 — API 基路径 /api/v1

pub mod account;
pub mod admin;
pub mod asset;
pub mod config;
pub mod device;
pub mod fiat;
pub mod health;
pub mod log;
pub mod notification;
pub mod rsa;
pub mod transaction;
pub mod wallet;

use crate::config::{AppConfig, RuntimeConfig};
use crate::middleware::AppState;
use crate::services::rsa_service::RsaKeys;
use axum::{middleware, Router};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub async fn build_routes(
    db: Arc<rbatis::RBatis>,
    config: AppConfig,
    cancel: CancellationToken,
) -> anyhow::Result<(Router, CancellationToken)> {
    let rsa_keys = Arc::new(RsaKeys::load(
        &config.rsa_private_key_path,
        &config.rsa_public_key_path,
    )?);
    let replay_cache_capacity = config.replay_cache_capacity;
    let admin_route_prefix = config.admin_route_prefix.clone();
    let runtime_config = Arc::new(RuntimeConfig::from(config));

    // 启动时加载汇率缓存
    let cny_rate = crate::services::fiat_service::get_usd_cny_rate(db.clone()).await?;

    let state = AppState::new(
        db.clone(),
        runtime_config,
        rsa_keys,
        replay_cache_capacity,
        cny_rate,
        admin_route_prefix.clone(),
    );

    // 启动汇率定时刷新（每 5 分钟，支持优雅关闭）
    spawn_cny_rate_refresh(db, state.clone(), cancel.clone());

    let public_routes: Router<AppState> = Router::new()
        .merge(device::public_router())
        .merge(fiat::router())
        .merge(rsa::router())
        .merge(log::router());

    let auth_routes: Router<AppState> = Router::new()
        .merge(device::protected_router())
        .merge(wallet::router())
        .merge(asset::router())
        .merge(transaction::router())
        .merge(account::router())
        .merge(config::router())
        .merge(notification::router())
        .merge(admin::router(&admin_route_prefix))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::device_auth::device_auth,
        ));

    Ok((
        Router::new()
            .route("/health", axum::routing::get(health::health_check_handler))
            .nest("/api/v1", public_routes.merge(auth_routes))
            .with_state(state),
        cancel,
    ))
}

/// 每 5 分钟刷新 USD→CNY 汇率缓存，支持优雅关闭
fn spawn_cny_rate_refresh(db: Arc<rbatis::RBatis>, state: AppState, cancel: CancellationToken) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    match crate::services::fiat_service::get_usd_cny_rate(db.clone()).await {
                        Ok(rate) => {
                            if state.set_cny_rate(rate) {
                                ::log::info!("CNY rate refreshed: {}", rate);
                            }
                        }
                        Err(e) => {
                            ::log::warn!("Failed to refresh CNY rate: {}", e);
                        }
                    }
                }
                _ = cancel.cancelled() => {
                    ::log::info!("CNY rate refresh task cancelled — graceful shutdown");
                    break;
                }
            }
        }
    });
}
