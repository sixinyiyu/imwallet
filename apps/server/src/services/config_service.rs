//! 配置服务

use crate::config::AppConfig;
use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::AppConfigEntity;
use rbatis::RBatis;
use sha2::{Digest, Sha256};
use std::sync::Arc;

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
    Ok(!allowed.is_empty() && allowed.iter().any(|d| d == device_id))
}

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

pub async fn get_activation_key(rb: Arc<RBatis>) -> Result<String, AppError> {
    let row: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["admin_activation_key"],
    )
    .await?;
    Ok(row.map(|r| r.value).unwrap_or_default())
}

/// 验证前端传来的 feedback code 是否与当前 admin_activation_key 匹配
/// code = device_id_seed XOR truncated_sha256(admin_activation_key)
/// 改了 activation_key 后，旧 code 立即失效
pub async fn verify_feedback_code(
    rb: Arc<RBatis>,
    device_id: &str,
    code: &str,
) -> Result<bool, AppError> {
    if code.is_empty() {
        return Ok(false);
    }
    let activation_key = get_activation_key(rb.clone()).await?;
    if activation_key.is_empty() {
        return Ok(false);
    }
    // 计算 expected code: SHA256(key) 取前4字节作为 u32，再 XOR device_id_seed
    let hash_bytes = Sha256::digest(activation_key.as_bytes());
    let mask: u32 =
        u32::from_be_bytes([hash_bytes[0], hash_bytes[1], hash_bytes[2], hash_bytes[3]]);
    let seed_hex = if device_id.len() >= 8 {
        &device_id[0..8]
    } else {
        "00000000"
    };
    let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);
    let expected_code = format!("{:08x}", seed_num ^ mask);
    Ok(code == expected_code)
}

pub async fn sync_config_to_db(rb: Arc<RBatis>, cfg: &AppConfig) -> Result<(), AppError> {
    let existing_pwd: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["server_pwd"],
    )
    .await?;
    let should_sync_pwd = existing_pwd
        .as_ref()
        .map(|r| r.value == "CHANGE_ME")
        .unwrap_or(true);
    if should_sync_pwd {
        let result: Option<AppConfigEntity> = query_one(
            &rb,
            "INSERT INTO app_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *",
            vals!["server_pwd", &cfg.server_pwd],
        )
        .await?;
        if result.is_some() {
            log::info!("Synced config to DB: server_pwd = ***");
        }
    } else {
        log::info!(
            "Skipped syncing server_pwd: DB value is not seed default, preserving ops change"
        );
    }

    let other_items: Vec<(&str, String)> = vec![
        ("fee_rate", cfg.fee_rate.to_string()),
        ("fee_mode", cfg.fee_mode.clone()),
        ("tx_restrict_wallet", cfg.tx_restrict_wallet.to_string()),
    ];
    for (key, value) in other_items {
        let result: Option<AppConfigEntity> = query_one(
            &rb,
            "INSERT INTO app_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *",
            vals![key, &value],
        )
        .await?;
        if result.is_some() {
            log::info!("Synced config to DB: {} = {}", key, value);
        }
    }

    Ok(())
}
