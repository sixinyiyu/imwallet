//! 资产地址余额模型 — 对应 assets_addresses 表

use rbdc::DateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetAddress {
    pub id: String,
    pub address_id: String,
    pub asset_id: String,
    pub chain: String,
    pub balance: Decimal,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
