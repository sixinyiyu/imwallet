//! 充值记录模型 — 对应 recharges 表

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recharge {
    pub id: String,
    pub wallet_id: String,
    pub wallet_alias: String,
    pub account_address: String,
    pub token_symbol: String,
    pub token_name: String,
    pub amount: Decimal,
    pub memo: String,
    pub device_id: String,
    pub platform: String,
    pub version: String,
    pub created_at: Option<NaiveDateTime>,
}
