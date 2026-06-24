//! 法币汇率路由 — /api/v1/fiat
//! 公开接口，无需签名

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::models::FiatCurrency;
use crate::services::fiat_service;
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;

pub fn router() -> Router<AppState> {
    Router::new().route("/fiat/rates", get(get_fiat_rates))
}

/// FiatCurrency 的公开视图（隐藏 id 和 updated_at）
#[derive(Debug, Serialize)]
struct FiatRateItem {
    code: String,
    name: String,
    symbol: String,
    rate: rust_decimal::Decimal,
    decimals: i32,
}

impl From<FiatCurrency> for FiatRateItem {
    fn from(r: FiatCurrency) -> Self {
        Self {
            code: r.code,
            name: r.name,
            symbol: r.symbol,
            rate: r.rate,
            decimals: r.decimals,
        }
    }
}

#[derive(Debug, Serialize)]
struct FiatRatesResponse {
    rates: Vec<FiatRateItem>,
}

/// GET /fiat/rates — 获取法币汇率
async fn get_fiat_rates(
    State(state): State<AppState>,
) -> Result<Json<FiatRatesResponse>, AppError> {
    let rates = fiat_service::get_fiat_rates(state.db.clone()).await?;
    Ok(Json(FiatRatesResponse {
        rates: rates.into_iter().map(FiatRateItem::from).collect(),
    }))
}
