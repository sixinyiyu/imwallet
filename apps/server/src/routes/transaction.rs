//! 交易路由 — /api/v1/transactions
//! 迁移自 IMWallet routes/transaction.ts (4 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::models::Transaction;
use crate::services::transaction_service;
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/transactions/transfer", post(transfer))
        .route("/transactions", get(get_transactions))
        .route("/transactions/check-address", get(check_address))
        .route("/transactions/{id}", get(get_transaction))
}

/// POST /transactions/transfer — 执行转账
async fn transfer(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<transaction_service::TransferInput>,
) -> Result<
    (
        axum::http::StatusCode,
        Json<transaction_service::TransferResult>,
    ),
    AppError,
> {
    let result = transaction_service::execute_transfer(
        state.db.clone(),
        body,
        &device.device_id,
        &device.platform,
        &state.config,
    )
    .await?;
    Ok((axum::http::StatusCode::CREATED, Json(result)))
}

#[derive(Debug, Deserialize)]
pub struct TransactionQuery {
    pub wallet_id: String,
    pub page: Option<u64>,
    pub limit: Option<u64>,
    #[serde(default)]
    pub token_symbol: Option<String>,
}

#[derive(Debug, Serialize)]
struct TransactionsResponse {
    transactions: Vec<TransactionItem>,
    total: u64,
}

/// 交易列表返回 DTO — status 写死 CONFIRMED（私有链即时确认，无状态流转）
#[derive(Debug, Serialize)]
struct TransactionItem {
    id: String,
    from_address: String,
    to_address: String,
    token_symbol: String,
    amount: rust_decimal::Decimal,
    fee: rust_decimal::Decimal,
    status: String,
    memo: String,
    platform: String,
    created_at: Option<rbdc::DateTime>,
}

impl From<Transaction> for TransactionItem {
    fn from(t: Transaction) -> Self {
        Self {
            id: t.id,
            from_address: t.from_address,
            to_address: t.to_address,
            token_symbol: t.token_symbol,
            amount: t.amount,
            fee: t.fee,
            status: "CONFIRMED".to_string(),
            memo: t.memo,
            platform: t.platform,
            created_at: t.created_at,
        }
    }
}

async fn get_transactions(
    State(state): State<AppState>,
    Query(query): Query<TransactionQuery>,
) -> Result<Json<TransactionsResponse>, AppError> {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20);
    let (txns, total) = transaction_service::get_transactions(
        state.db.clone(),
        &query.wallet_id,
        query.token_symbol.as_deref(),
        page,
        limit,
    )
    .await?;

    Ok(Json(TransactionsResponse {
        transactions: txns.into_iter().map(TransactionItem::from).collect(),
        total,
    }))
}

#[derive(Debug, Serialize)]
struct CheckAddressResponse {
    in_system: bool,
}

/// GET /transactions/check-address?address=xxx — 检查地址是否在系统内
#[derive(Debug, Deserialize)]
pub struct CheckAddressQuery {
    pub address: String,
}

async fn check_address(
    State(state): State<AppState>,
    Query(query): Query<CheckAddressQuery>,
) -> Result<Json<CheckAddressResponse>, AppError> {
    let in_system = transaction_service::check_address(state.db.clone(), &query.address).await?;
    Ok(Json(CheckAddressResponse { in_system }))
}

/// GET /transactions/:id — 获取交易详情
async fn get_transaction(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TransactionItem>, AppError> {
    let txn = transaction_service::get_transaction(state.db.clone(), &id)
        .await?
        .ok_or_else(|| AppError::NotFound("交易不存在".into()))?;
    Ok(Json(TransactionItem::from(txn)))
}
