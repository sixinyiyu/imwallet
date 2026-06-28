//! 管理路由 — /api/v1/admin
//! 需要 device_auth + SERVER_PWD 双重验证
//! 密码字段使用 RSA 加密传输，服务端解密后比对

use crate::db::query::{query, vals};
use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::config_service;
use axum::{
    extract::{Path, State},
    routing::post,
    Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/devices", post(list_devices))
        .route("/admin/devices/{id}", post(get_device_detail))
        .route("/admin/wallets", post(list_wallets))
        .route(
            "/admin/wallets/{id}/transactions",
            post(get_wallet_transactions),
        )
        .route("/admin/wallets/{id}/recharges", post(get_wallet_recharges))
}

// ── 密码验证 ──

#[derive(Debug, Deserialize)]
pub struct AdminAuth {
    /// RSA 公钥加密后的密码（Base64 编码）
    pub encrypted_password: String,
}

#[derive(Debug, Deserialize)]
struct AdminDataAuth {
    encrypted_password: String,
    #[serde(default)]
    offset: i64,
}

/// RSA 解密密码后验证管理员身份
async fn decrypt_and_verify_admin(
    state: &AppState,
    encrypted_password: &str,
) -> Result<String, AppError> {
    // RSA 私钥解密
    let password = state.rsa_keys.decrypt(encrypted_password).map_err(|e| {
        log::error!("Admin RSA decrypt failed: {}", e);
        AppError::BadRequest("密码解密失败".into())
    })?;

    // 诊断日志：不输出密码本身，只输出长度和 SHA256 哈希前8位，方便排查不匹配问题
    let pwd_hash = {
        use sha2::{Digest, Sha256};
        let h = Sha256::digest(password.as_bytes());
        hex::encode(&h[..4])
    };
    log::info!(
        "Admin auth: decrypted pwd len={}, hash_prefix={}",
        password.len(),
        pwd_hash
    );

    // 验证管理密码
    let verified = config_service::verify_service_password(state.db.clone(), &password).await?;
    if verified {
        log::info!("Admin auth: password verified OK");
        Ok(password)
    } else {
        log::error!(
            "Admin auth: password verification FAILED (pwd len={}, hash_prefix={})",
            password.len(),
            pwd_hash
        );
        Err(AppError::Forbidden("管理密码验证失败".into()))
    }
}

// ── 设备列表 ──

#[derive(Debug, Serialize)]
struct DeviceListItem {
    id: String,
    platform: String,
    online: bool,
    wallet_count: i64,
    last_active_at: Option<DateTime>,
    created_at: Option<DateTime>,
}

/// POST /admin/devices — 设备列表（需 device_auth + 密码验证）
async fn list_devices(
    State(state): State<AppState>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<Vec<DeviceListItem>>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    #[derive(serde::Deserialize)]
    struct Row {
        id: String,
        platform: String,
        last_active_at: Option<DateTime>,
        created_at: Option<DateTime>,
        wallet_count: i64,
    }

    let rows: Vec<Row> = query(
        &state.db,
        "SELECT d.id, d.platform, d.last_active_at, d.created_at, COUNT(ws.wallet_id) as wallet_count FROM devices d LEFT JOIN wallet_subscriptions ws ON ws.device_id = d.id AND ws.address_id != '' GROUP BY d.id, d.platform, d.last_active_at, d.created_at ORDER BY d.last_active_at DESC NULLS LAST, d.created_at DESC",
        vals![],
    )
    .await?;

    let now_ts = time::OffsetDateTime::now_utc().unix_timestamp();
    let items: Vec<DeviceListItem> = rows
        .into_iter()
        .map(|r| {
            let online = r
                .last_active_at
                .clone()
                .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);
            DeviceListItem {
                id: r.id,
                platform: r.platform,
                online,
                wallet_count: r.wallet_count,
                last_active_at: r.last_active_at,
                created_at: r.created_at,
            }
        })
        .collect();

    Ok(Json(items))
}

// ── 设备详情 ──

#[derive(Debug, Serialize)]
struct WalletBrief {
    wallet_id: String,
    alias: String,
    source: String,
    chain: String,
    address: String,
}

#[derive(Debug, Serialize)]
struct DeviceDetailResponse {
    id: String,
    platform: String,
    online: bool,
    last_active_at: Option<DateTime>,
    created_at: Option<DateTime>,
    wallets: Vec<WalletBrief>,
}

/// POST /admin/devices/:id — 设备详情（需 device_auth + 密码验证）
async fn get_device_detail(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<DeviceDetailResponse>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    #[derive(serde::Deserialize)]
    struct DeviceRow {
        id: String,
        platform: String,
        last_active_at: Option<DateTime>,
        created_at: Option<DateTime>,
    }

    let device: DeviceRow = query(
        &state.db,
        "SELECT id, platform, last_active_at, created_at FROM devices WHERE id = $1",
        vals![&device_id],
    )
    .await?
    .into_iter()
    .next()
    .ok_or_else(|| AppError::NotFound("设备不存在".into()))?;

    #[derive(serde::Deserialize)]
    struct WalletRow {
        wallet_id: String,
        alias: String,
        source: String,
        chain: String,
        address: String,
    }

    let wallets: Vec<WalletRow> = query(
        &state.db,
        "SELECT ws.wallet_id, w.alias, w.source, wa.chain, wa.address FROM wallet_subscriptions ws JOIN wallets w ON w.id = ws.wallet_id JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.device_id = $1 AND ws.address_id != '' ORDER BY ws.wallet_id, wa.chain",
        vals![&device_id],
    )
    .await?;

    let now_ts = time::OffsetDateTime::now_utc().unix_timestamp();
    let online = device
        .last_active_at
        .clone()
        .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);

    Ok(Json(DeviceDetailResponse {
        id: device.id,
        platform: device.platform,
        online,
        last_active_at: device.last_active_at,
        created_at: device.created_at,
        wallets: wallets
            .into_iter()
            .map(|w| WalletBrief {
                wallet_id: w.wallet_id,
                alias: w.alias,
                source: w.source,
                chain: w.chain,
                address: w.address,
            })
            .collect(),
    }))
}

// ── 钱包列表（管理视角） ──

#[derive(Debug, Serialize, Clone)]
struct DeviceBrief {
    id: String,
    platform: String,
    online: bool,
}

#[derive(Debug, Serialize)]
struct WalletAdminItem {
    id: String,
    alias: String,
    source: String,
    chains: Vec<String>,
    device_count: i64,
    devices: Vec<DeviceBrief>,
    created_at: Option<DateTime>,
}

/// POST /admin/wallets — 钱包列表（含关联设备，需 device_auth + 密码验证）
async fn list_wallets(
    State(state): State<AppState>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<Vec<WalletAdminItem>>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    // 1. 查所有钱包
    #[derive(serde::Deserialize)]
    struct WalletRow {
        id: String,
        alias: String,
        source: String,
        created_at: Option<DateTime>,
    }

    let wallets: Vec<WalletRow> = query(
        &state.db,
        "SELECT id, alias, source, created_at FROM wallets ORDER BY created_at DESC",
        vals![],
    )
    .await?;

    // 2. 查每个钱包的 chain 列表
    #[derive(serde::Deserialize)]
    struct ChainRow {
        wallet_id: String,
        chain: String,
    }

    let chains: Vec<ChainRow> = query(
        &state.db,
        "SELECT ws.wallet_id, wa.chain FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.address_id != '' GROUP BY ws.wallet_id, wa.chain ORDER BY ws.wallet_id, wa.chain",
        vals![],
    )
    .await?;

    // 3. 查每个钱包关联的设备
    #[derive(serde::Deserialize)]
    struct DeviceSubRow {
        wallet_id: String,
        device_id: String,
        platform: String,
        last_active_at: Option<DateTime>,
    }

    let subs: Vec<DeviceSubRow> = query(
        &state.db,
        "SELECT ws.wallet_id, d.id as device_id, d.platform, d.last_active_at FROM wallet_subscriptions ws JOIN devices d ON d.id = ws.device_id WHERE ws.address_id != '' GROUP BY ws.wallet_id, d.id, d.platform, d.last_active_at ORDER BY ws.wallet_id, d.last_active_at DESC NULLS LAST",
        vals![],
    )
    .await?;

    let now_ts = time::OffsetDateTime::now_utc().unix_timestamp();

    // 组装
    let chain_map: std::collections::HashMap<String, Vec<String>> =
        chains
            .into_iter()
            .fold(std::collections::HashMap::new(), |mut m, r| {
                m.entry(r.wallet_id).or_default().push(r.chain);
                m
            });

    let device_map: std::collections::HashMap<String, Vec<DeviceBrief>> =
        subs.into_iter()
            .fold(std::collections::HashMap::new(), |mut m, r| {
                let online = r
                    .last_active_at
                    .clone()
                    .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);
                m.entry(r.wallet_id).or_default().push(DeviceBrief {
                    id: r.device_id,
                    platform: r.platform,
                    online,
                });
                m
            });

    let items: Vec<WalletAdminItem> = wallets
        .into_iter()
        .map(|w| {
            let wid = w.id.clone();
            let devices = device_map.get(&wid).cloned().unwrap_or_default();
            let device_count = devices.len() as i64;
            WalletAdminItem {
                id: w.id,
                alias: w.alias,
                source: w.source,
                chains: chain_map.get(&wid).cloned().unwrap_or_default(),
                device_count,
                devices,
                created_at: w.created_at,
            }
        })
        .collect();

    Ok(Json(items))
}

// ── 钱包交易记录 ──

/// POST /admin/wallets/:id/transactions — 该钱包的交易记录（需 device_auth + 密码验证，支持 offset 分页）
async fn get_wallet_transactions(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
    Json(auth): Json<AdminDataAuth>,
) -> Result<Json<Vec<crate::models::Transaction>>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    let rows: Vec<crate::models::Transaction> = query(
        &state.db,
        "WITH wallet_addr AS (SELECT DISTINCT wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND ws.address_id != '') SELECT t.* FROM transactions t WHERE t.from_address IN (SELECT address FROM wallet_addr) OR t.to_address IN (SELECT address FROM wallet_addr) ORDER BY t.created_at DESC LIMIT 20 OFFSET $2",
        vals![&wallet_id, auth.offset],
    )
    .await?;

    Ok(Json(rows))
}

// ── 钱包充值记录 ──

/// POST /admin/wallets/:id/recharges — 该钱包的充值记录（需 device_auth + 密码验证，支持 offset 分页）
async fn get_wallet_recharges(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
    Json(auth): Json<AdminDataAuth>,
) -> Result<Json<Vec<crate::models::Recharge>>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    let rows: Vec<crate::models::Recharge> = query(
        &state.db,
        "SELECT * FROM recharges WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 20 OFFSET $2",
        vals![&wallet_id, auth.offset],
    )
    .await?;

    Ok(Json(rows))
}
