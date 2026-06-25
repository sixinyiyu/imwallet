//! 钱包路由 — /api/v1/wallets
//! 迁移自 IMWallet routes/wallet.ts (9 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::models::{Wallet, WalletAddress};
use crate::services::{device_service, wallet_service};
use axum::{
    extract::{Path, Query, State},
    routing::{delete, get},
    Extension, Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/wallets", get(get_wallets).post(create_wallet))
        .route("/wallets/aggregate", get(get_wallets_aggregate))
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
struct WalletAggregateResponse {
    wallets: Vec<wallet_service::WalletAggregate>,
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

/// GET /wallets/aggregate — 获取钱包列表聚合数据
async fn get_wallets_aggregate(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<WalletAggregateResponse>, AppError> {
    let aggregates =
        wallet_service::get_wallets_aggregate_by_device(state.db.clone(), &device.device_id)
            .await?;
    Ok(Json(WalletAggregateResponse {
        wallets: aggregates,
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
    let wallet = wallet_service::get_wallet(state.db.clone(), &id)
        .await?
        .ok_or_else(|| AppError::NotFound("钱包不存在".into()))?;
    let cny_rate = crate::services::fiat_service::get_cached_cny_rate(&state);
    let balance = wallet_service::get_wallet_balance(state.db.clone(), &id, cny_rate).await?;
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
    wallet_service::delete_wallet_with_subs(state.db.clone(), &id, &device.device_id).await?;
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
    let wa = wallet_service::subscribe_chain(state.db.clone(), &body.chain, &body.address).await?;

    // 创建订阅记录
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

/// GET /wallets/:id/addresses — 获取钱包的所有链上地址
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
