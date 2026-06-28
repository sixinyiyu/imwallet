//! 配置服务

use crate::config::AppConfig;
use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::AppConfigEntity;
use rbatis::RBatis;
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

/// 判断指定设备是否有充值权限
/// 仅白名单中明确列出的设备有权限，白名单为空时所有设备均无权限
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

/// 验证服务配置密码 — 从数据库读取 server_pwd，避免内存缓存导致修改后不生效
pub async fn verify_service_password(rb: Arc<RBatis>, password: &str) -> Result<bool, AppError> {
    let row: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["server_pwd"],
    )
    .await?;
    let stored_pwd = row.map(|r| r.value).unwrap_or_default();
    // 诊断日志：不输出密码本身，只输出长度和哈希前缀，方便排查
    let input_hash = {
        use sha2::{Digest, Sha256};
        let h = Sha256::digest(password.as_bytes());
        hex::encode(&h[..4])
    };
    let stored_hash = {
        use sha2::{Digest, Sha256};
        let h = Sha256::digest(stored_pwd.as_bytes());
        hex::encode(&h[..4])
    };
    log::info!("verify_service_password: input_len={}, input_hash={}, stored_len={}, stored_hash={}, match={}", 
        password.len(), input_hash, stored_pwd.len(), stored_hash, password == stored_pwd);
    if stored_pwd.is_empty() {
        return Ok(false);
    }
    Ok(password == stored_pwd)
}

/// 获取管理激活关键字（存储在 app_configs，运维可随时修改数据库值）
/// 反馈接口匹配到此关键字后返回 admin_cap，解锁管理菜单
pub async fn get_activation_key(rb: Arc<RBatis>) -> Result<String, AppError> {
    let row: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["admin_activation_key"],
    )
    .await?;
    Ok(row.map(|r| r.value).unwrap_or_default())
}

/// Sync config.toml values to database app_configs table.
/// For server_pwd: only overwrite when DB value is the seed default ("CHANGE_ME"),
/// preserving any value manually set by ops.
/// For other config items: always overwrite (they are not security-sensitive).
pub async fn sync_config_to_db(rb: Arc<RBatis>, cfg: &AppConfig) -> Result<(), AppError> {
    // server_pwd: 仅覆盖种子默认值，保留运维手动修改的值
    let existing_pwd: Option<AppConfigEntity> = query_one(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["server_pwd"],
    )
    .await?;
    let should_sync_pwd = existing_pwd
        .as_ref()
        .map(|r| r.value == "CHANGE_ME")
        .unwrap_or(true); // DB 无记录 → 需要写入
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

    // 其他配置项：始终覆盖（非安全敏感）
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