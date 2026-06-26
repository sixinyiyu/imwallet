//! 配置服务

use crate::config::AppConfig;
use crate::config::RuntimeConfig;
use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::AppConfigEntity;
use rbatis::RBatis;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct FeeConfig {
    pub fee_rate: f64,
    pub fee_mode: String,
}

pub async fn get_fee_config(rb: Arc<RBatis>, cfg: &RuntimeConfig) -> Result<FeeConfig, AppError> {
    let rows: Vec<AppConfigEntity> = query(
        &rb,
        "SELECT * FROM app_configs WHERE key IN ('fee_rate', 'fee_mode')",
        vals![],
    )
    .await?;
    Ok(FeeConfig {
        fee_rate: rows
            .iter()
            .find(|c| c.key == "fee_rate")
            .and_then(|c| c.value.parse().ok())
            .unwrap_or(cfg.fee_rate),
        fee_mode: rows
            .iter()
            .find(|c| c.key == "fee_mode")
            .map(|c| c.value.clone())
            .unwrap_or_else(|| cfg.fee_mode.clone()),
    })
}

pub async fn get_all_configs(rb: Arc<RBatis>) -> Result<Vec<AppConfigEntity>, AppError> {
    query(&rb, "SELECT * FROM app_configs ORDER BY key", vals![])
        .await
        .map_err(AppError::from)
}

pub async fn update_config(
    rb: Arc<RBatis>,
    key: &str,
    value: &str,
) -> Result<AppConfigEntity, AppError> {
    query_one(
        &rb,
        "INSERT INTO app_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *",
        vals![key, value],
    )
    .await?
    .ok_or_else(|| AppError::NotFound("config item not found".into()))
}

pub async fn verify_service_password(
    password: &str,
    cfg: &RuntimeConfig,
) -> Result<bool, AppError> {
    let e = &cfg.server_pwd;
    if e.is_empty() {
        return Ok(false);
    }
    Ok(password == e)
}

/// 同步版本：管理路由密码验证（无需 async）
pub fn verify_service_password_sync(password: &str, cfg: &RuntimeConfig) -> bool {
    let e = &cfg.server_pwd;
    if e.is_empty() {
        return false;
    }
    password == e
}

/// Sync config.toml values to database app_configs table.
/// Overwrites seed data defaults (e.g. CHANGE_ME) with actual config values.
/// Uses UPSERT (ON CONFLICT DO UPDATE) so it's idempotent.
pub async fn sync_config_to_db(rb: Arc<RBatis>, cfg: &AppConfig) -> Result<(), AppError> {
    let items: Vec<(&str, String)> = vec![
        ("server_pwd", cfg.server_pwd.clone()),
        ("fee_rate", cfg.fee_rate.to_string()),
        ("fee_mode", cfg.fee_mode.clone()),
        ("tx_restrict_wallet", cfg.tx_restrict_wallet.to_string()),
    ];

    for (key, value) in items {
        let display_value = if key == "server_pwd" {
            "***".to_string()
        } else {
            value.clone()
        };

        let result: Option<AppConfigEntity> = query_one(
            &rb,
            "INSERT INTO app_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *",
            vals![key, value],
        )
        .await?;

        if result.is_some() {
            log::info!("Synced config to DB: {} = {}", key, display_value);
        }
    }

    Ok(())
}
