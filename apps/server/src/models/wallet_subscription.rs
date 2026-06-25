//! 钱包-设备订阅模型 — 对应 wallet_subscriptions 表

use rbdc::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletSubscription {
    pub id: Option<i32>,
    pub wallet_id: String,
    pub device_id: String,
    pub chain: String,
    pub address_id: String,
    pub created_at: Option<DateTime>,
}
