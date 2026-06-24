//! 应用日志模型 — 对应 app_logs 表

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // ORM 模型：仅通过 query<T> 泛型反序列化使用，不直接构造
pub struct AppLog {
    pub id: Option<i32>,
    pub device_id: String,
    pub platform: String,
    pub version: String,
    pub log_type: String,
    pub content: String,
    pub created_at: Option<NaiveDateTime>,
}
