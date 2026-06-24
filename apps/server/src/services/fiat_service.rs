//! 法币汇率服务

use crate::db::query::{query, vals};
use crate::errors::AppError;
use crate::middleware::AppState;
use crate::models::FiatCurrency;
use rbatis::RBatis;
use rust_decimal::Decimal;
use std::sync::Arc;

pub async fn get_fiat_rates(rb: Arc<RBatis>) -> Result<Vec<FiatCurrency>, AppError> {
    query(&rb, "SELECT * FROM fiat_currencies ORDER BY code", vals![])
        .await
        .map_err(AppError::from)
}

/// 从 DB 加载 USD→CNY 汇率（仅用于启动初始化和定时刷新）
pub async fn get_usd_cny_rate(rb: Arc<RBatis>) -> Result<Decimal, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        rate: Decimal,
    }
    let rows: Vec<R> = query(
        &rb,
        "SELECT rate FROM fiat_currencies WHERE code = 'CNY' LIMIT 1",
        vals![],
    )
    .await?;
    Ok(rows
        .into_iter()
        .next()
        .map(|r| r.rate)
        .unwrap_or(Decimal::new(725, 2)))
}

/// 从 AppState 缓存读取 USD→CNY 汇率（高频调用用此函数，RwLock 读锁无阻塞）
pub fn get_cached_cny_rate(state: &AppState) -> Decimal {
    state.get_cny_rate()
}
