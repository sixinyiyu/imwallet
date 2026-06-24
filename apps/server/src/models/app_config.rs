//! 应用配置模型 — 对应 app_configs 表

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfigEntity {
    pub id: Option<i32>,
    pub key: String,
    pub value: String,
    pub updated_at: Option<NaiveDateTime>,
}
