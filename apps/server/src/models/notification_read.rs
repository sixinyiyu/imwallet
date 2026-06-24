//! 通知阅读状态模型 — 对应 notification_reads 表

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)] // ORM 模型：仅通过 query<T> 泛型反序列化使用，不直接构造
pub struct NotificationRead {
    pub id: Option<i32>,
    pub notification_id: String,
    pub device_id: String,
    pub is_read: bool,
    pub read_at: Option<NaiveDateTime>,
    pub created_at: Option<NaiveDateTime>,
}
