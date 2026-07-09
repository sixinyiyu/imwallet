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
    let admin_route_prefix = config.admin_route_prefix.clone();
    let runtime_config = Arc::new(RuntimeConfig::from(config));

    // 启动时加载汇率缓存
    let cny_rate = crate::services::fiat_service::get_usd_cny_rate(db.clone()).await?;

    // 启动时预热必要缓存（assets、chains），确保后续业务代码可直接读内存
    crate::services::asset_service::warmup_active_assets_cache(db.clone()).await?;
    crate::services::account_service::warmup_chains_cache(db.clone()).await?;

    let state = AppState::new(
        db.clone(),
        runtime_config,
        rsa_keys,
        cny_rate,
        admin_route_prefix.clone(),
    );

    // 启动汇率定时刷新（每 5 分钟，支持优雅关闭）
    spawn_cny_rate_refresh(db.clone(), state.clone(), cancel.clone());

    // 启动孤儿钱包定时清理（每月 1 日凌晨执行，支持优雅关闭）
    spawn_orphan_wallet_cleanup(db.clone(), cancel.clone());

    let public_routes: Router<AppState> = Router::new()
        .merge(device::public_router())
        .merge(fiat::router())
        .merge(rsa::router())
        .merge(log::router());

    let auth_routes: Router<AppState> = Router::new()
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

/// 每月清理孤儿钱包（无订阅且超过阈值天数未活跃），支持优雅关闭
/// 使用 tokio::time::interval 实现，间隔 30 天（2592000 秒）
fn spawn_orphan_wallet_cleanup(db: Arc<rbatis::RBatis>, cancel: CancellationToken) {
    tokio::spawn(async move {
        // 首次延迟 1 小时执行（避免启动时立即清理），之后每 30 天执行一次
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2592000));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        // 首次 tick 立即触发，跳过它，等下一个周期
        interval.tick().await;
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    match crate::services::wallet_service::cleanup_orphan_wallets(db.clone()).await {
                        Ok(count) => {
                            ::log::info!("Orphan wallet cleanup completed: {} wallets removed", count);
                        }
                        Err(e) => {
                            ::log::warn!("Failed to cleanup orphan wallets: {}", e);
                        }
                    }
                }
                _ = cancel.cancelled() => {
                    ::log::info!("Orphan wallet cleanup task cancelled — graceful shutdown");
                    break;
                }
            }
        }
    });
}
