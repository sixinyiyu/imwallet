//! 法币汇率模型 — 对应 fiat_currencies 表

use fastdate::DateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiatCurrency {
    pub id: String,
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub rate: Decimal,
    pub decimals: i32,
    pub updated_at: Option<DateTime>,
}
