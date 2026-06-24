//! 钱包地址模型 — 对应 wallets_addresses 表

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletAddress {
    pub id: String,
    pub chain: String,
    pub address: String,
    pub created_at: Option<NaiveDateTime>,
}
