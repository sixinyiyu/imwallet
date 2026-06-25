//! 链实体模型 — 对应 chains 表

use rbdc::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // ORM 模型：仅通过 query<T> 泛型反序列化使用，不直接构造
pub struct ChainEntity {
    pub id: Option<i32>,
    pub name: String,
    pub display_name: String,
    pub account_enable: bool,
    pub derivation_path: String,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
