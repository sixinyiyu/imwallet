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

/// 判断指定设备是否有充值权限
/// 白名单为空时允许所有设备，非空时只允许白名单中的设备
pub async fn is_recharge_permitted(rb: Arc<RBatis>, device_id: &str) -> Result<bool, AppError> {
    let row: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["recharge_allowed_devices"],
    )
    .await?;
    let allowed: Vec<String> = row
        .and_then(|c| serde_json::from_str::<Vec<String>>(&c.value).ok())
        .unwrap_or_default();
    // 白名单为空 → 所有设备都有权限；非空 → 仅白名单中的设备有权限
    Ok(allowed.is_empty() || allowed.iter().any(|d| d == device_id))
}

/// 验证服务配置密码 — 从数据库读取 server_pwd，避免内存缓存导致修改后不生效
pub async fn verify_service_password(rb: Arc<RBatis>, password: &str) -> Result<bool, AppError> {
    let row: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["server_pwd"],
    )
    .await?;
    let stored_pwd = row.map(|r| r.value).unwrap_or_default();
    if stored_pwd.is_empty() {
        return Ok(false);
    }
    Ok(password == stored_pwd)
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
