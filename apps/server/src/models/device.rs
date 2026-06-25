//! 设备模型 — 对应 devices 表

use rbdc::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub platform: String,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}
