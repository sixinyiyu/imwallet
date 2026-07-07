//! 管理路由 — /api/v1/{prefix}
//! 前缀从 config.toml [admin].route_prefix 读取（默认 "vault"），可随时更换
//! 需要 device_auth + SERVER_PWD 双重验证
//! 密码字段使用 RSA 加密传输，服务端解密后比对
//! 路由前缀通过反馈匹配后 AES-256-GCM 加密返回给前端，前端动态拼接

use crate::db::query::{query, vals};
use crate::errors::AppError;
use crate::middleware::AppState;
use crate::middleware::DevicePayload;
use crate::services::config_service;
use crate::services::recharge_service;
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::post,
    Extension, Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn router(prefix: &str) -> Router<AppState> {
    Router::new()
        .route(&format!("/{}/devices", prefix), post(list_devices))
        .route(
            &format!("/{}/devices/{{id}}", prefix),
            post(get_device_detail),
        )
        .route(&format!("/{}/wallets", prefix), post(list_wallets))
        .route(
            &format!("/{}/wallets/{{id}}/transactions", prefix),
            post(get_wallet_transactions),
        )
        .route(&format!("/{}/recharges", prefix), post(get_all_recharges))
        .route(
            &format!("/{}/wallets/{{id}}/recharges", prefix),
            post(execute_recharge),
        )
}

// ── 密码验证 ──

#[derive(Debug, Deserialize)]
pub struct AdminAuth {
    /// RSA 公钥加密后的密码（Base64 编码）
    pub encrypted_password: String,
}

#[derive(Debug, Deserialize)]
struct AdminListAuth {
    encrypted_password: String,
    /// 可选：按钱包 ID 过滤充值记录（仅 recharge-records 使用）
    #[serde(default)]
    wallet_id: Option<String>,
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

    let verified = config_service::verify_service_password(state.db.clone(), &password).await?;
    if verified {
        Ok(password)
    } else {
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

    #[derive(serde::Deserialize)]
    struct WalletRow {
        wallet_id: String,
        alias: String,
        source: String,
        chain: String,
        address: String,
    }

    // 并行查询设备信息 + 钱包订阅列表
    let (device_res, wallets_res) = tokio::join!(
        query::<DeviceRow>(
            &state.db,
            "SELECT id, platform, last_active_at, created_at FROM devices WHERE id = $1",
            vals![&device_id],
        ),
        query::<WalletRow>(
            &state.db,
            "SELECT ws.wallet_id, w.alias, w.source, wa.chain, wa.address FROM wallet_subscriptions ws JOIN wallets w ON w.id = ws.wallet_id JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.device_id = $1 AND ws.address_id != '' ORDER BY ws.wallet_id, wa.chain",
            vals![&device_id],
        ),
    );
    let device = device_res?
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("设备不存在".into()))?;
    let wallets = wallets_res?;

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

    // 单条 SQL：钱包 + 链 + 设备 + 余额，一次性拉取（分页）
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
        asset_id: Option<String>,
        symbol: Option<String>,
        asset_name: Option<String>,
        asset_chain: Option<String>,
        icon_url: Option<String>,
        total_balance: Option<rust_decimal::Decimal>,
    }

    let rows: Vec<Row> = query(
        &state.db,
        "SELECT w.id as wallet_id, w.alias, w.source, w.created_at as wallet_created_at, wa.chain, d.id as device_id, d.platform as device_platform, d.last_active_at as device_last_active_at, aa.asset_id, a.symbol, a.name as asset_name, aa.chain as asset_chain, a.icon_url, aa.balance as total_balance FROM wallets w LEFT JOIN wallet_subscriptions ws ON ws.wallet_id = w.id AND ws.address_id != '' LEFT JOIN wallets_addresses wa ON wa.id = ws.address_id LEFT JOIN devices d ON d.id = ws.device_id LEFT JOIN assets_addresses aa ON aa.address_id = ws.address_id LEFT JOIN assets a ON a.id = aa.asset_id WHERE w.id IN (SELECT id FROM wallets ORDER BY created_at DESC LIMIT $1 OFFSET $2) ORDER BY w.created_at DESC, wa.chain, d.last_active_at DESC NULLS LAST",
        vals![auth.limit as i64, offset as i64],
    )
    .await?;

    let now_ts = time::OffsetDateTime::now_utc().unix_timestamp();
    let cny_rate = state.get_cny_rate();

    // HashMap 分组组装
    let mut wallet_map: std::collections::HashMap<String, WalletAdminItem> =
        std::collections::HashMap::new();
    type BalTuple = (
        String,
        String,
        String,
        String,
        String,
        rust_decimal::Decimal,
    );
    let mut balance_map: std::collections::HashMap<String, Vec<BalTuple>> =
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
        if let (Some(aid), Some(sym), Some(name), Some(ac), Some(url), Some(bal)) = (
            &r.asset_id,
            &r.symbol,
            &r.asset_name,
            &r.asset_chain,
            &r.icon_url,
            r.total_balance,
        ) {
            balance_map.entry(r.wallet_id.clone()).or_default().push((
                aid.clone(),
                sym.clone(),
                name.clone(),
                ac.clone(),
                url.clone(),
                bal,
            ));
        }
    }

    // Sort by created_at DESC, update device_count
    let mut items: Vec<WalletAdminItem> = wallet_map.into_values().collect();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for item in &mut items {
        item.device_count = item.devices.len() as i64;
    }

    // 合并余额数据到钱包列表（保持 Decimal，避免 String 往返）
    for item in &mut items {
        let balances = balance_map.remove(&item.id).unwrap_or_default();
        let total_cny: rust_decimal::Decimal = balances
            .iter()
            .map(|(_, _, _, _, _, bal)| bal * cny_rate)
            .sum();
        item.total_balance_cny = total_cny.to_string();
        item.assets = balances
            .into_iter()
            .map(|(aid, sym, name, chain, url, bal)| AssetBalanceBrief {
                asset_id: aid,
                symbol: sym,
                name,
                chain,
                icon_url: url,
                balance: bal.to_string(),
                cny_value: (bal * cny_rate).to_string(),
            })
            .collect();
    }

    Ok(Json(WalletListResponse {
        wallets: items,
        total,
        page: auth.page,
        limit: auth.limit,
    }))
}

// ── 钱包交易记录 ──

/// POST /{prefix}/wallets/:id/transactions — 该钱包的交易记录（需 device_auth + 密码验证，分页）
#[derive(Debug, Serialize)]
struct TransactionListResponse {
    transactions: Vec<crate::models::Transaction>,
    total: u64,
    page: u64,
    limit: u64,
}

async fn get_wallet_transactions(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
    Json(auth): Json<AdminListAuth>,
) -> Result<Json<TransactionListResponse>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    let offset = (auth.page - 1) * auth.limit;

    #[derive(serde::Deserialize)]
    struct TxWithCount {
        #[serde(flatten)]
        tx: crate::models::Transaction,
        total_count: Option<i64>,
    }
    let rows: Vec<TxWithCount> = query(
        &state.db,
        "WITH wallet_addr AS (SELECT DISTINCT wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND ws.address_id != '') SELECT t.*, COUNT(*) OVER() as total_count FROM transactions t WHERE t.from_address IN (SELECT address FROM wallet_addr) OR t.to_address IN (SELECT address FROM wallet_addr) ORDER BY t.created_at DESC LIMIT $2 OFFSET $3",
        vals![&wallet_id, auth.limit as i64, offset as i64],
    )
    .await?;
    let total = rows.first().and_then(|r| r.total_count).unwrap_or(0) as u64;
    let transactions: Vec<crate::models::Transaction> = rows.into_iter().map(|r| r.tx).collect();

    Ok(Json(TransactionListResponse {
        transactions,
        total,
        page: auth.page,
        limit: auth.limit,
    }))
}

// ── 充值记录（全量分页） ──

/// POST /{prefix}/recharges — 充值记录查询（需 device_auth + 密码验证，分页，可选 wallet_id 过滤）
#[derive(Debug, Serialize)]
struct RechargeListResponse {
    recharges: Vec<crate::models::Recharge>,
    total: u64,
    page: u64,
    limit: u64,
}

async fn get_all_recharges(
    State(state): State<AppState>,
    Json(auth): Json<AdminListAuth>,
) -> Result<Json<RechargeListResponse>, AppError> {
    decrypt_and_verify_admin(&state, &auth.encrypted_password).await?;

    // 可选 wallet_id 过滤（有值且 trim 后有内容才过滤）
    let filter_wallet_id = auth.wallet_id.as_ref().and_then(|w| {
        let trimmed = w.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let (total, rows) = if let Some(ref wid) = filter_wallet_id {
        #[derive(serde::Deserialize)]
        struct RechargeWithCount {
            #[serde(flatten)]
            recharge: crate::models::Recharge,
            total_count: Option<i64>,
        }
        let offset = (auth.page - 1) * auth.limit;
        let rows: Vec<RechargeWithCount> = query(
            &state.db,
            "SELECT r.*, COUNT(*) OVER() as total_count FROM recharges r WHERE r.wallet_id = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3",
            vals![wid, auth.limit as i64, offset as i64],
        )
        .await?;
        let total = rows.first().and_then(|r| r.total_count).unwrap_or(0) as u64;
        let recharges: Vec<crate::models::Recharge> =
            rows.into_iter().map(|r| r.recharge).collect();
        (total, recharges)
    } else {
        #[derive(serde::Deserialize)]
        struct RechargeWithCount {
            #[serde(flatten)]
            recharge: crate::models::Recharge,
            total_count: Option<i64>,
        }
        let offset = (auth.page - 1) * auth.limit;
        let rows: Vec<RechargeWithCount> = query(
            &state.db,
            "SELECT r.*, COUNT(*) OVER() as total_count FROM recharges r ORDER BY r.created_at DESC LIMIT $1 OFFSET $2",
            vals![auth.limit as i64, offset as i64],
        )
        .await?;
        let total = rows.first().and_then(|r| r.total_count).unwrap_or(0) as u64;
        let recharges: Vec<crate::models::Recharge> =
            rows.into_iter().map(|r| r.recharge).collect();
        (total, recharges)
    };

    Ok(Json(RechargeListResponse {
        recharges: rows,
        total,
        page: auth.page,
        limit: auth.limit,
    }))
}
// ── 执行充值 ──

/// POST /{prefix}/wallets/{id}/recharges — 执行充值（需 device_auth + 白名单，不需要管理密码）
/// 充值操作已有两层保护：device_auth（Ed25519 签名）+ recharge_allowed_devices 白名单
/// 管理密码仅用于管理视角（查询所有记录、修改配置等），不用于执行充值
#[derive(Debug, Deserialize)]
struct RechargeAuth {
    wallet_alias: String,
    token_symbol: String,
    network: String,
    account_address: String,
    amount: rust_decimal::Decimal,
    #[serde(default)]
    memo: Option<String>,
}

async fn execute_recharge(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(wallet_id): Path<String>,
    headers: HeaderMap,
    Json(auth): Json<RechargeAuth>,
) -> Result<
    (
        axum::http::StatusCode,
        Json<recharge_service::RechargeResult>,
    ),
    AppError,
> {
    // 充值不需要管理密码验证，device_auth + 白名单已足够
    // 白名单校验在 recharge_service::execute_recharge 内部执行

    let version = headers
        .get("x-app-version")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let input = recharge_service::RechargeInput {
        wallet_id,
        wallet_alias: auth.wallet_alias,
        token_symbol: auth.token_symbol,
        network: auth.network,
        account_address: auth.account_address,
        amount: auth.amount,
        memo: auth.memo,
    };

    let result = recharge_service::execute_recharge(
        state.db.clone(),
        input,
        &device.device_id,
        &device.platform,
        version,
    )
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(result)))
}
