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

#[derive(Debug, Deserialize)]
struct AdminListAuth {
    encrypted_password: String,
    #[serde(default = "default_page")]
    page: u64,
    #[serde(default = "default_limit")]
    limit: u64,
}

fn default_page() -> u64 {
    1
}
fn default_limit() -> u64 {
    10
}

/// RSA 解密密码后验证管理员身份
async fn decrypt_and_verify_admin(
    state: &AppState,
    encrypted_password: &str,
) -> Result<String, AppError> {
    let password = state.rsa_keys.decrypt(encrypted_password).map_err(|e| {
        log::error!("Admin RSA decrypt failed: {}", e);
        AppError::BadRequest("密码解密失败".into())
    })?;

    log::debug!("Admin auth: decrypted pwd len={}", password.len());

    let verified = config_service::verify_service_password(state.db.clone(), &password).await?;
    if verified {
        log::debug!("Admin auth: password verified OK");
        Ok(password)
    } else {
        log::debug!(
            "Admin auth: password verification FAILED (pwd len={})",
            password.len()
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
    total_balance_cny: String,
    assets: Vec<AssetBalanceBrief>,
    created_at: Option<DateTime>,
}

#[derive(Debug, Serialize, Clone)]
struct AssetBalanceBrief {
    asset_id: String,
    symbol: String,
    name: String,
    chain: String,
    icon_url: String,
    balance: String,
    cny_value: String,
}

/// POST /admin/wallets — 钱包列表（分页，单条 SQL JOIN + 内存分组，替代 N+3 查询）
#[derive(Debug, Serialize)]
struct WalletListResponse {
    wallets: Vec<WalletAdminItem>,
    total: u64,
    page: u64,
    limit: u64,
}

async fn list_wallets(
    State(state): State<AppState>,
    Json(auth): Json<AdminListAuth>,
) -> Result<Json<WalletListResponse>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    // 先查总数
    let total: u64 =
        crate::db::query::query_count(&state.db, "SELECT COUNT(*) as cnt FROM wallets", vals![])
            .await?;

    // 单条 SQL：钱包 + 链 + 设备，一次性拉取（分页）
    let offset = (auth.page - 1) * auth.limit;
    #[derive(serde::Deserialize)]
    struct Row {
        wallet_id: String,
        alias: String,
        source: String,
        wallet_created_at: Option<DateTime>,
        chain: Option<String>,
        device_id: Option<String>,
        device_platform: Option<String>,
        device_last_active_at: Option<DateTime>,
    }

    let rows: Vec<Row> = query(
        &state.db,
        "SELECT w.id as wallet_id, w.alias, w.source, w.created_at as wallet_created_at, wa.chain, d.id as device_id, d.platform as device_platform, d.last_active_at as device_last_active_at FROM wallets w LEFT JOIN wallet_subscriptions ws ON ws.wallet_id = w.id AND ws.address_id != '' LEFT JOIN wallets_addresses wa ON wa.id = ws.address_id LEFT JOIN devices d ON d.id = ws.device_id WHERE w.id IN (SELECT id FROM wallets ORDER BY created_at DESC LIMIT $1 OFFSET $2) ORDER BY w.created_at DESC, wa.chain, d.last_active_at DESC NULLS LAST",
        vals![auth.limit as i64, offset as i64],
    )
    .await?;

    let now_ts = time::OffsetDateTime::now_utc().unix_timestamp();

    // HashMap 分组组装
    let mut wallet_map: std::collections::HashMap<String, WalletAdminItem> =
        std::collections::HashMap::new();

    for r in &rows {
        let entry = wallet_map
            .entry(r.wallet_id.clone())
            .or_insert_with(|| WalletAdminItem {
                id: r.wallet_id.clone(),
                alias: r.alias.clone(),
                source: r.source.clone(),
                chains: Vec::new(),
                device_count: 0,
                devices: Vec::new(),
                total_balance_cny: "0".to_string(),
                assets: Vec::new(),
                created_at: r.wallet_created_at.clone(),
            });
        if let Some(chain) = &r.chain {
            if !entry.chains.contains(chain) {
                entry.chains.push(chain.clone());
            }
        }
        if let Some(did) = &r.device_id {
            if !entry.devices.iter().any(|d| d.id == *did) {
                let online = r
                    .device_last_active_at
                    .clone()
                    .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);
                entry.devices.push(DeviceBrief {
                    id: did.clone(),
                    platform: r.device_platform.clone().unwrap_or_default(),
                    online,
                });
            }
        }
    }

    // Sort by created_at DESC, update device_count
    let mut items: Vec<WalletAdminItem> = wallet_map.into_values().collect();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for item in &mut items {
        item.device_count = item.devices.len() as i64;
    }

    // 批量查询每个钱包的代币余额（单条 SQL，避免 N+1）
    let cny_rate = state.get_cny_rate();
    let wallet_ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
    if !wallet_ids.is_empty() {
        #[derive(serde::Deserialize)]
        struct BalanceRow {
            wallet_id: String,
            asset_id: String,
            symbol: String,
            name: String,
            chain: String,
            icon_url: String,
            total_balance: rust_decimal::Decimal,
        }
        let id_list: String = wallet_ids
            .iter()
            .map(|id| format!("'{}'", id))
            .collect::<Vec<String>>()
            .join(",");
        let sql = format!(
            "SELECT ws.wallet_id, aa.asset_id, a.symbol, a.name, aa.chain, a.icon_url, SUM(aa.balance) as total_balance FROM assets_addresses aa JOIN assets a ON a.id = aa.asset_id JOIN wallet_subscriptions ws ON ws.address_id = aa.address_id WHERE ws.wallet_id IN ({}) AND ws.address_id != '' GROUP BY ws.wallet_id, aa.asset_id, a.symbol, a.name, aa.chain, a.icon_url",
            id_list
        );
        let balance_rows: Vec<BalanceRow> = query(&state.db, &sql, vals![]).await?;

        // 按钱包分组
        let mut balance_map: std::collections::HashMap<String, Vec<AssetBalanceBrief>> =
            std::collections::HashMap::new();
        for r in &balance_rows {
            balance_map
                .entry(r.wallet_id.clone())
                .or_default()
                .push(AssetBalanceBrief {
                    asset_id: r.asset_id.clone(),
                    symbol: r.symbol.clone(),
                    name: r.name.clone(),
                    chain: r.chain.clone(),
                    icon_url: r.icon_url.clone(),
                    balance: r.total_balance.to_string(),
                    cny_value: (r.total_balance * cny_rate).to_string(),
                });
        }

        // 合并余额数据到钱包列表
        for item in &mut items {
            let assets = balance_map.remove(&item.id).unwrap_or_default();
            let total_cny: rust_decimal::Decimal = assets
                .iter()
                .map(|a| {
                    a.cny_value
                        .parse::<rust_decimal::Decimal>()
                        .unwrap_or_default()
                })
                .sum();
            item.total_balance_cny = total_cny.to_string();
            item.assets = assets;
        }
    }

    Ok(Json(WalletListResponse {
        wallets: items,
        total,
        page: auth.page,
        limit: auth.limit,
    }))
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
