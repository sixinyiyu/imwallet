//! 钱包模型 — 对应 wallets 表

use crate::errors::AppError;
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub alias: String,
    pub source: String,
    pub created_at: Option<DateTime>,
    pub updated_at: Option<DateTime>,
}

impl Wallet {
    /// 验证钱包字段合法性
    #[allow(dead_code)] // 渐进式添加，route handler 中逐步调用
    pub fn validate(&self) -> Result<(), AppError> {
        if self.id.is_empty() {
            return Err(AppError::BadRequest("wallet id 不能为空".to_string()));
        }
        if self.alias.len() > 64 {
            return Err(AppError::BadRequest("alias 过长（最多64字符）".to_string()));
        }
        if !matches!(self.source.as_str(), "CREATE" | "IMPORT" | "SUBSCRIBE") {
            return Err(AppError::BadRequest(
                "invalid source: must be CREATE/IMPORT/SUBSCRIBE".to_string(),
            ));
        }
        Ok(())
    }
}
