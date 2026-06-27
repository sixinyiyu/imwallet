//! 交易记录模型 — 对应 transactions 表

use rbdc::DateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub tx_hash: String,
    pub from_address: String,
    pub to_address: String,
    pub token_symbol: String,
    pub amount: Decimal,
    pub fee: Decimal,
    pub status: String,
    pub memo: String,
    pub platform: String,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
