//! 充值路由 — /api/v1/recharges (2 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::models::Recharge;
use crate::services::recharge_service;
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::get,
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new().route("/recharges", get(get_recharges).post(execute_recharge))
}

/// POST /recharges — 执行充值
async fn execute_recharge(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    headers: HeaderMap,
    Json(body): Json<recharge_service::RechargeInput>,
) -> Result<
    (
        axum::http::StatusCode,
        Json<recharge_service::RechargeResult>,
    ),
    AppError,
> {
    let version = headers
        .get("x-app-version")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let result = recharge_service::execute_recharge(
        state.db.clone(),
        body,
        &device.device_id,
        &device.platform,
        version,
    )
    .await?;
    Ok((axum::http::StatusCode::CREATED, Json(result)))
}

#[derive(Debug, Deserialize)]
struct RechargeQuery {
    wallet_id: Option<String>,
    token_symbol: Option<String>,
    page: Option<u64>,
    limit: Option<u64>,
}

#[derive(Debug, Serialize)]
struct RechargesResponse {
    recharges: Vec<RechargeItem>,
    total: u64,
}

/// Recharge 的公开视图（隐藏 device_id/platform/version 等内部字段）
#[derive(Debug, Serialize)]
struct RechargeItem {
    id: String,
    wallet_id: String,
    wallet_alias: String,
    account_address: String,
    token_symbol: String,
    token_name: String,
    amount: rust_decimal::Decimal,
    memo: String,
    created_at: Option<fastdate::DateTime>,
}

impl From<Recharge> for RechargeItem {
    fn from(r: Recharge) -> Self {
        Self {
            id: r.id,
            wallet_id: r.wallet_id,
            wallet_alias: r.wallet_alias,
            account_address: r.account_address,
            token_symbol: r.token_symbol,
            token_name: r.token_name,
            amount: r.amount,
            memo: r.memo,
            created_at: r.created_at,
        }
    }
}

async fn get_recharges(
    State(state): State<AppState>,
    Query(query): Query<RechargeQuery>,
) -> Result<Json<RechargesResponse>, AppError> {
    let (recharges, total) = recharge_service::get_recharges(
        state.db.clone(),
        query.wallet_id.as_deref(),
        query.token_symbol.as_deref(),
        query.page.unwrap_or(1),
        query.limit.unwrap_or(20),
    )
    .await?;
    Ok(Json(RechargesResponse {
        recharges: recharges.into_iter().map(RechargeItem::from).collect(),
        total,
    }))
}
