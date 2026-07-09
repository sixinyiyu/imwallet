//! 钱包路由 — /api/v1/wallets
//! 迁移自 IMWallet routes/wallet.ts (9 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::models::{Wallet, WalletAddress};
use crate::services::{device_service, wallet_service};
use axum::{
    extract::{Path, Query, State},
    routing::{delete, get, post},
    Extension, Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wallets", get(get_wallets).post(create_wallet))
        .route("/wallets/sync", post(batch_sync_wallets))
        .route("/wallets/all", get(get_all_wallets))
        .route("/wallets/{id}", get(get_wallet).delete(delete_wallet))
        .route("/wallets/{id}/balance", get(get_wallet_balance))
        .route(
            "/wallets/{id}/addresses",
            get(get_wallet_addresses).post(subscribe_chain),
        )
        .route(
            "/wallets/{id}/addresses/{address_id}",
            delete(delete_address),
        )
        .route(
            "/wallets/{id}/subscribe",
            post(subscribe_wallet_readonly).delete(unsubscribe_wallet_readonly),
        )
        .route("/recharges", get(get_all_recharges))
}

// ── Response DTOs ──

#[derive(Debug, Serialize)]
struct WalletResponse {
    id: String,
    alias: String,
    source: String,
    created_at: Option<DateTime>,
    updated_at: Option<DateTime>,
}

impl From<Wallet> for WalletResponse {
    fn from(w: Wallet) -> Self {
        Self {
            id: w.id,
            alias: w.alias,
            source: w.source,
            created_at: w.created_at,
            updated_at: w.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
struct WalletListResponse {
    wallets: Vec<WalletBrief>,
}

#[derive(Debug, Serialize)]
struct WalletBrief {
    id: String,
    alias: String,
    source: String,
}

impl From<Wallet> for WalletBrief {
    fn from(w: Wallet) -> Self {
        Self {
            id: w.id,
            alias: w.alias,
            source: w.source,
        }
    }
}

#[derive(Debug, Serialize)]
struct WalletAllResponse {
    wallets: Vec<WalletAllItem>,
    total: u64,
    page: u64,
    limit: u64,
}

#[derive(Debug, Serialize)]
struct WalletAllItem {
    id: String,
    alias: String,
    source: String,
    created_at: Option<DateTime>,
}

impl From<Wallet> for WalletAllItem {
    fn from(w: Wallet) -> Self {
        Self {
            id: w.id,
            alias: w.alias,
            source: w.source,
            created_at: w.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
struct WalletDetailResponse {
    id: String,
    alias: String,
    source: String,
    total_balance_usd: rust_decimal::Decimal,
    total_balance_cny: rust_decimal::Decimal,
    token_balances: Vec<wallet_service::AssetBalanceItem>,
    created_at: Option<DateTime>,
    updated_at: Option<DateTime>,
}

#[derive(Debug, Serialize)]
struct WalletBalanceResponse {
    total_balance_usd: rust_decimal::Decimal,
    total_balance_cny: rust_decimal::Decimal,
    assets: Vec<wallet_service::AssetBalanceItem>,
}

#[derive(Debug, Serialize)]
struct AddressResponse {
    id: String,
    chain: String,
    address: String,
    created_at: Option<DateTime>,
}

impl From<WalletAddress> for AddressResponse {
    fn from(a: WalletAddress) -> Self {
        Self {
            id: a.id,
            chain: a.chain,
            address: a.address,
            created_at: a.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
struct SubscribeWalletResponse {
    wallet: WalletResponse,
    addresses: Vec<AddressResponse>,
}

#[derive(Debug, Serialize)]
struct AddressListResponse {
    addresses: Vec<AddressResponse>,
}

// ── Request DTOs ──

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub wallet_id: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub alias: String,
}

#[derive(Debug, Deserialize)]
pub struct WalletQuery {
    pub search: Option<String>,
    pub page: Option<u64>,
    pub limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SyncAddressRequest {
    pub chain: String,
    pub address: String,
}

// ── Handlers ──

/// POST /wallets — 创建/导入钱包（事务保护：创建钱包 + 自动订阅）
async fn create_wallet(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<CreateWalletRequest>,
) -> Result<(axum::http::StatusCode, Json<WalletResponse>), AppError> {
    let wallet = wallet_service::create_wallet_and_subscribe(
        state.db.clone(),
        &body.wallet_id,
        &body.source,
        &body.alias,
        &device.device_id,
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(WalletResponse::from(wallet)),
    ))
}

/// POST /wallets/sync — 批量同步钱包+地址（启动时一次请求替代 N+M 次串行同步）
#[derive(Debug, Deserialize)]
struct BatchSyncRequest {
    wallets: Vec<wallet_service::SyncWalletInput>,
}

#[derive(Debug, Serialize)]
struct BatchSyncResponse {
    results: Vec<wallet_service::SyncResult>,
}

async fn batch_sync_wallets(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<BatchSyncRequest>,
) -> Result<Json<BatchSyncResponse>, AppError> {
    let results =
        wallet_service::batch_sync_wallets(state.db.clone(), &device.device_id, body.wallets)
            .await?;
    Ok(Json(BatchSyncResponse { results }))
}

/// GET /wallets — 获取当前设备的钱包列表
async fn get_wallets(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<WalletListResponse>, AppError> {
    let wallets =
        wallet_service::get_wallets_by_device(state.db.clone(), &device.device_id).await?;
    Ok(Json(WalletListResponse {
        wallets: wallets.into_iter().map(WalletBrief::from).collect(),
    }))
}

/// GET /wallets/all — 获取所有系统钱包
async fn get_all_wallets(
    State(state): State<AppState>,
    Query(query): Query<WalletQuery>,
) -> Result<Json<WalletAllResponse>, AppError> {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20);
    let (wallets, total) =
        wallet_service::get_all_wallets(state.db.clone(), query.search.as_deref(), page, limit)
            .await?;
    Ok(Json(WalletAllResponse {
        wallets: wallets.into_iter().map(WalletAllItem::from).collect(),
        total,
        page,
        limit,
    }))
}

/// GET /wallets/:id — 获取钱包详情
async fn get_wallet(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<WalletDetailResponse>, AppError> {
    let cny_rate = crate::services::fiat_service::get_cached_cny_rate(&state);
    // 合并为单次查询：钱包详情 + 余额聚合
    let result = wallet_service::get_wallet_with_balance(state.db.clone(), &id, cny_rate).await?;
    let (wallet, balance) = result.ok_or_else(|| AppError::NotFound("钱包不存在".into()))?;
    Ok(Json(WalletDetailResponse {
        id: wallet.id,
        alias: wallet.alias,
        source: wallet.source,
        total_balance_usd: balance.total_balance_usd,
        total_balance_cny: balance.total_balance_cny,
        token_balances: balance.assets,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at,
    }))
}

/// DELETE /wallets/:id — 删除钱包（事务保护：同时删除订阅和钱包）
async fn delete_wallet(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    wallet_service::delete_wallet_subscription(state.db.clone(), &id, &device.device_id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// GET /wallets/:id/balance — 获取钱包余额详情
async fn get_wallet_balance(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<WalletBalanceResponse>, AppError> {
    let cny_rate = crate::services::fiat_service::get_cached_cny_rate(&state);
    let balance = wallet_service::get_wallet_balance(state.db.clone(), &id, cny_rate).await?;
    Ok(Json(WalletBalanceResponse {
        total_balance_usd: balance.total_balance_usd,
        total_balance_cny: balance.total_balance_cny,
        assets: balance.assets,
    }))
}

/// POST /wallets/:id/addresses — 订阅链（创建/获取地址 + 设备订阅 + 初始化代币余额）
async fn subscribe_chain(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(wallet_id): Path<String>,
    Json(body): Json<SyncAddressRequest>,
) -> Result<(axum::http::StatusCode, Json<AddressResponse>), AppError> {
    log::info!(
        "[链上账户] 创建 — 钱包={}, 链={}, 地址={}, 设备={}",
        wallet_id,
        body.chain,
        &body.address[..8.min(body.address.len())],
        device.device_id
    );

    // 事务包裹：地址创建/获取 + 设备订阅，保证一致性
    let wa = wallet_service::subscribe_chain(state.db.clone(), &body.chain, &body.address).await?;
    device_service::subscribe_wallet(
        state.db.clone(),
        &wallet_id,
        &device.device_id,
        &body.chain,
        &wa.id,
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(AddressResponse::from(wa)),
    ))
}

/// POST /wallets/:id/subscribe — 只读订阅钱包（当前设备订阅一个已存在的钱包）
async fn subscribe_wallet_readonly(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(wallet_id): Path<String>,
) -> Result<(axum::http::StatusCode, Json<SubscribeWalletResponse>), AppError> {
    let (wallet, addresses) =
        wallet_service::subscribe_wallet_readonly(state.db.clone(), &wallet_id, &device.device_id)
            .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(SubscribeWalletResponse {
            wallet: WalletResponse::from(wallet),
            addresses: addresses.into_iter().map(AddressResponse::from).collect(),
        }),
    ))
}

/// DELETE /wallets/:id/subscribe — 取消只读订阅（删除当前设备对该钱包的订阅记录）
async fn unsubscribe_wallet_readonly(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(wallet_id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    wallet_service::unsubscribe_wallet_readonly(state.db.clone(), &wallet_id, &device.device_id)
        .await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// GET /wallets/:id/addresseses — 获取钱包的所有链上地址
async fn get_wallet_addresses(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AddressListResponse>, AppError> {
    let addresses = wallet_service::get_wallet_addresses(state.db.clone(), &id).await?;
    Ok(Json(AddressListResponse {
        addresses: addresses.into_iter().map(AddressResponse::from).collect(),
    }))
}

/// DELETE /wallets/:id/addresses/:address_id — 删除服务端地址
async fn delete_address(
    State(state): State<AppState>,
    Path((_wallet_id, address_id)): Path<(String, String)>,
) -> Result<axum::http::StatusCode, AppError> {
    wallet_service::delete_address(state.db.clone(), &address_id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
// ── 充值记录查询（白名单设备，无需管理密码） ──

fn default_page() -> u64 {
    1
}
fn default_limit() -> u64 {
    20
}

#[derive(Debug, Serialize)]
struct MyRechargesResponse {
    recharges: Vec<crate::models::Recharge>,
    total: u64,
    page: u64,
    limit: u64,
}

// ── 全量充值记录查询（白名单设备，无需管理密码，不做 device 过滤） ──

/// GET /recharges — 查询所有充值记录（不做 device_id 过滤）
/// 仅需 device_auth + 充值白名单，不需要管理密码
/// 支持 wallet_id / time_range 筛选
/// time_range: "today" / "7d" / "30d" / "90d"，后端内部转换为 timestamp 比较
#[derive(Debug, Deserialize)]
struct AllRechargesQuery {
    #[serde(default = "default_page")]
    page: u64,
    #[serde(default = "default_limit")]
    limit: u64,
    #[serde(default)]
    wallet_id: Option<String>,
    #[serde(default)]
    time_range: Option<String>,
}

#[allow(unused_assignments)]
async fn get_all_recharges(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Query(query): Query<AllRechargesQuery>,
) -> Result<Json<MyRechargesResponse>, AppError> {
    // 校验充值白名单（与 /recharges/my 一致）
    let permitted =
        crate::services::config_service::is_recharge_permitted(state.db.clone(), &device.device_id)
            .await?;
    if !permitted {
        return Err(AppError::Forbidden("无权查看充值记录".into()));
    }

    let offset = (query.page - 1) * query.limit;

    // 动态构建 WHERE 条件：不做 device_id 过滤，支持 wallet_id / time_range
    let mut conditions: Vec<String> = Vec::new();
    let mut args: Vec<rbs::value::Value> = Vec::new();
    let mut param_idx = 1u32;

    if let Some(ref wid) = query.wallet_id {
        conditions.push(format!("r.wallet_id = ${}", param_idx));
        args.push(rbs::value!(wid));
        param_idx += 1;
    }
    if let Some(ref tr) = query.time_range {
        // time_range: "today" / "7d" / "30d" / "90d"
        // 后端内部转换为 start/end timestamp，避免前端传 ISO 字符串导致类型不匹配
        let now = time::OffsetDateTime::now_utc();
        let start_date = match tr.as_str() {
            "today" => now.date(),
            "7d" => (now - time::Duration::days(6)).date(),
            "30d" => (now - time::Duration::days(29)).date(),
            "90d" => (now - time::Duration::days(89)).date(),
            _ => now.date(), // 未知值默认今日
        };
        let start_ts = start_date.with_time(time::Time::MIDNIGHT).assume_utc();
        let end_ts = (now + time::Duration::days(1))
            .date()
            .with_time(time::Time::MIDNIGHT)
            .assume_utc();
        conditions.push(format!("r.created_at >= ${}", param_idx));
        args.push(rbs::value!(rbdc::DateTime::from_timestamp(
            start_ts.unix_timestamp()
        )));
        param_idx += 1;
        conditions.push(format!("r.created_at < ${}", param_idx));
        args.push(rbs::value!(rbdc::DateTime::from_timestamp(
            end_ts.unix_timestamp()
        )));
        param_idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    // 合并 COUNT+SELECT 为单次查询（窗口函数）
    args.push(rbs::value!(query.limit as i64));
    args.push(rbs::value!(offset as i64));
    let limit_ph = format!("${}", args.len() - 1);
    let offset_ph = format!("${}", args.len());

    #[derive(serde::Deserialize)]
    struct RechargeWithCount {
        #[serde(flatten)]
        recharge: crate::models::Recharge,
        total_count: Option<i64>,
    }
    let rows: Vec<RechargeWithCount> = crate::db::query::query(
        &state.db,
        &format!(
            "SELECT r.*, COUNT(*) OVER() as total_count FROM recharges r{} ORDER BY r.created_at DESC LIMIT {} OFFSET {}",
            where_clause, limit_ph, offset_ph
        ),
        args,
    )
    .await?;
    let total = rows.first().and_then(|r| r.total_count).unwrap_or(0) as u64;
    let recharges: Vec<crate::models::Recharge> = rows.into_iter().map(|r| r.recharge).collect();

    Ok(Json(MyRechargesResponse {
        recharges,
        total,
        page: query.page,
        limit: query.limit,
    }))
}
