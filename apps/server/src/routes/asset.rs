//! 资产路由 — /api/v1/assets (4 个接口)

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::asset_service;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/assets", get(get_active_assets))
        .route("/assets/{wallet_id}/balance", get(get_wallet_total_balance))
        .route("/assets/{wallet_id}/list", get(get_wallet_asset_list))
        .route("/assets/{id}/tradable", put(toggle_tradable))
}

#[derive(Debug, Serialize)]
struct AssetsResponse {
    assets: Vec<crate::models::Asset>,
}

async fn get_active_assets(
    State(state): State<AppState>,
) -> Result<Json<AssetsResponse>, AppError> {
    let assets = asset_service::get_active_assets(state.db.clone()).await?;
    Ok(Json(AssetsResponse { assets }))
}

#[derive(Debug, Serialize)]
struct BalanceSummary {
    total_balance_cny: rust_decimal::Decimal,
    total_balance_usd: rust_decimal::Decimal,
}

async fn get_wallet_total_balance(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
) -> Result<Json<BalanceSummary>, AppError> {
    let cny_rate = crate::services::fiat_service::get_cached_cny_rate(&state);
    let balance =
        crate::services::wallet_service::get_wallet_balance(state.db.clone(), &wallet_id, cny_rate)
            .await?;
    Ok(Json(BalanceSummary {
        total_balance_cny: balance.total_balance_cny,
        total_balance_usd: balance.total_balance_usd,
    }))
}

#[derive(Debug, Serialize)]
struct AssetListResponse {
    assets: Vec<asset_service::AssetBalanceDetail>,
}

async fn get_wallet_asset_list(
    State(state): State<AppState>,
    Path(wallet_id): Path<String>,
) -> Result<Json<AssetListResponse>, AppError> {
    let cny_rate = crate::services::fiat_service::get_cached_cny_rate(&state);
    let list = asset_service::get_wallet_asset_list(state.db.clone(), &wallet_id, cny_rate).await?;
    Ok(Json(AssetListResponse { assets: list }))
}

#[derive(Debug, Deserialize)]
struct ToggleTradableRequest {
    #[serde(rename = "isTradable")]
    is_tradable: bool,
}

#[derive(Debug, Serialize)]
struct ToggleTradableResponse {
    id: String,
    symbol: String,
    is_tradable: bool,
}

impl From<crate::models::Asset> for ToggleTradableResponse {
    fn from(a: crate::models::Asset) -> Self {
        Self {
            id: a.id,
            symbol: a.symbol,
            is_tradable: a.is_tradable,
        }
    }
}

async fn toggle_tradable(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleTradableRequest>,
) -> Result<Json<ToggleTradableResponse>, AppError> {
    let asset = asset_service::toggle_tradable(state.db.clone(), &id, body.is_tradable).await?;
    Ok(Json(ToggleTradableResponse::from(asset)))
}
