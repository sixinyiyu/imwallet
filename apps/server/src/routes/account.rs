//! 账户路由 — /api/v1/accounts
//! 迁移自 IMWallet routes/account.ts (2 个接口)

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::account_service;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/accounts/chains/available", get(get_available_chains))
        .route("/accounts/wallets/networks/batch", get(get_wallet_networks))
}

#[derive(Debug, Serialize)]
struct ChainsResponse {
    chains: Vec<account_service::AvailableChain>,
}

/// GET /accounts/chains/available — 获取支持创建账户的链列表
async fn get_available_chains(
    State(state): State<AppState>,
) -> Result<Json<ChainsResponse>, AppError> {
    let chains = account_service::get_available_chains_cached(state.db.clone()).await?;
    Ok(Json(ChainsResponse { chains }))
}

#[derive(Debug, Deserialize)]
pub struct WalletNetworksParams {
    #[serde(rename = "walletIds")]
    pub wallet_ids: String,
}

#[derive(Debug, Serialize)]
struct WalletsNetworkResponse {
    wallets: Vec<account_service::WalletNetworkInfo>,
}

async fn get_wallet_networks(
    State(state): State<AppState>,
    Query(params): Query<WalletNetworksParams>,
) -> Result<Json<WalletsNetworkResponse>, AppError> {
    let ids: Vec<String> = params
        .wallet_ids
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();
    let wallets = account_service::get_wallet_networks(state.db.clone(), &ids).await?;
    Ok(Json(WalletsNetworkResponse { wallets }))
}
