//! 钱包模型 — 对应 wallets 表

use fastdate::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub alias: String,
    pub source: String,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
