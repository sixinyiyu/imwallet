//! 配置服务

use crate::config::AppConfig;
use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::AppConfigEntity;
use rbatis::RBatis;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 配置缓存项
struct CachedConfig {
    value: String,
    fetched_at: Instant,
}

/// 配置缓存：key → CachedConfig
/// TTL 30 秒，平衡实时性与性能
static CONFIG_CACHE: tokio::sync::OnceCell<
    std::sync::Mutex<std::collections::HashMap<String, CachedConfig>>,
> = tokio::sync::OnceCell::const_new();

const CONFIG_CACHE_TTL: Duration = Duration::from_secs(30);

/// 从缓存获取配置，未命中或过期则查 DB 并缓存
async fn get_config_cached(rb: Arc<RBatis>, key: &str) -> Result<String, AppError> {
    let cache = CONFIG_CACHE
        .get_or_init(|| async { std::sync::Mutex::new(std::collections::HashMap::new()) })
        .await;
    {
        let guard = cache.lock().unwrap();
        if let Some(c) = guard.get(key) {
            if c.fetched_at.elapsed() < CONFIG_CACHE_TTL {
                return Ok(c.value.clone());
            }
        }
    }
    // 缓存未命中或过期，查 DB
    let row: Option<AppConfigEntity> =
        query_one(&rb, "SELECT * FROM app_configs WHERE key = $1", vals![key]).await?;
    let value = row.map(|r| r.value).unwrap_or_default();
    {
        let mut guard = cache.lock().unwrap();
        guard.insert(
            key.to_string(),
            CachedConfig {
                value: value.clone(),
                fetched_at: Instant::now(),
            },
        );
    }
    Ok(value)
}

/// 清除指定 key 的缓存（配置更新时调用）
fn invalidate_cache(key: &str) {
    if let Some(cache) = CONFIG_CACHE.get() {
        let mut guard = cache.lock().unwrap();
        guard.remove(key);
    }
}

/// 清除所有缓存
#[allow(dead_code)]
fn invalidate_all() {
    if let Some(cache) = CONFIG_CACHE.get() {
        let mut guard = cache.lock().unwrap();
        guard.clear();
    }
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
    let result: AppConfigEntity = query_one(
        &rb,
        "INSERT INTO app_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *",
        vals![key, value],
    )
    .await?
    .ok_or_else(|| AppError::NotFound("config item not found".into()))?;
    invalidate_cache(key);
    Ok(result)
}

pub async fn is_recharge_permitted(rb: Arc<RBatis>, device_id: &str) -> Result<bool, AppError> {
    let value = get_config_cached(rb, "recharge_allowed_devices").await?;
    let allowed: Vec<String> = serde_json::from_str::<Vec<String>>(&value)
        .ok()
        .unwrap_or_default();
    Ok(!allowed.is_empty() && allowed.iter().any(|d| d == device_id))
}

pub async fn verify_service_password(rb: Arc<RBatis>, password: &str) -> Result<bool, AppError> {
    let stored_pwd = get_config_cached(rb, "server_pwd").await?;
    if stored_pwd.is_empty() {
        return Ok(false);
    }
    Ok(password == stored_pwd)
}

pub async fn get_activation_key(rb: Arc<RBatis>) -> Result<String, AppError> {
    get_config_cached(rb, "admin_activation_key").await
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
