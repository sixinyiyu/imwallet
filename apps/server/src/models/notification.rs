//! 通知模型 — 对应 notifications 表

use rbdc::DateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // ORM 模型：仅通过 query<T> 泛型反序列化使用，不直接构造
pub struct Notification {
    pub id: String,
    pub wallet_id: String,
    pub title: String,
    pub content: String,
    pub r#type: String,
    pub metadata: Option<Value>,
    pub created_at: Option<DateTime>,
}
