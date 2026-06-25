//! 应用配置模型 — 对应 app_configs 表
//!
//! rbdc_pg 返回 TIMESTAMP 为 rbdc::DateTime（包装 fastdate::DateTime），统一使用 rbdc::DateTime 类型。

use rbdc::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfigEntity {
    pub id: Option<i32>,
    pub key: String,
    pub value: String,
    pub updated_at: Option<DateTime>,
}
