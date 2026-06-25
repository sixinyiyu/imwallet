//! 应用配置模型 — 对应 app_configs 表
//!
//! rbdc_pg 返回 TIMESTAMP(3) 为毫秒整数，无法反序列化为 NaiveDateTime，
//! 因此 updated_at 使用 i64 类型（毫秒时间戳）。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfigEntity {
    pub id: Option<i32>,
    pub key: String,
    pub value: String,
    pub updated_at: Option<i64>,
}
