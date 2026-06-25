//! 资产模型 — 对应 assets 表

use fastdate::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub decimals: i32,
    pub chain: String,
    pub r#type: String,
    pub token_id: String,
    pub icon_url: String,
    pub is_default: bool,
    pub is_active: bool,
    pub is_tradable: bool,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
