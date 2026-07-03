//! 统一错误类型
//! 迁移自 IMWallet 的 AppError 类

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Internal server error")]
    Internal(String),
    #[error("Too many requests: {0}")]
    TooManyRequests(String),
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::TooManyRequests(_) => StatusCode::TOO_MANY_REQUESTS,
        }
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    code: String,
    message: String,
}

/// 遍历 error source chain，拼接完整错误链字符串
/// 即使 release 构建无 debug 符号，也能看到完整的错误原因链
fn format_error_chain(err: &dyn std::error::Error) -> String {
    let mut chain = format!("{}", err);
    let mut source = std::error::Error::source(err);
    let mut depth = 0;
    while let Some(s) = source {
        depth += 1;
        chain.push_str(&format!("\n  caused by (depth {}): {}", depth, s));
        source = std::error::Error::source(s);
    }
    chain
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        let code = match &self {
            AppError::Unauthorized(_) => "UNAUTHORIZED",
            AppError::Forbidden(_) => "FORBIDDEN",
            AppError::BadRequest(msg) => {
                if msg.contains("余额不足") {
                    "INSUFFICIENT_BALANCE"
                } else if msg.contains("地址") {
                    "INVALID_ADDRESS"
                } else if msg.contains("不在") {
                    "NOT_IN_SYSTEM"
                } else {
                    "BAD_REQUEST"
                }
            }
            AppError::NotFound(msg) => {
                if msg.contains("钱包") {
                    "WALLET_NOT_FOUND"
                } else if msg.contains("交易") {
                    "TRANSACTION_NOT_FOUND"
                } else if msg.contains("代币") {
                    "ASSET_NOT_FOUND"
                } else {
                    "NOT_FOUND"
                }
            }
            AppError::Conflict(_) => "CONFLICT",
            AppError::Internal(_) => "INTERNAL_ERROR",
            AppError::TooManyRequests(_) => "RATE_LIMITED",
        };
        let message = match &self {
            AppError::Internal(detail) => {
                // 遍历错误链输出完整原因（比 Backtrace 更可靠，release 构建也能用）
                let chain = format_error_chain(&self);
                let bt = std::backtrace::Backtrace::capture();
                log::error!(
                    "Internal error: {}\nError chain: {}\nBacktrace: {}",
                    detail,
                    chain,
                    bt
                );
                "Internal server error".to_string()
            }
            _ => self.to_string(),
        };
        let body = ErrorResponse {
            code: code.to_string(),
            message,
        };
        (status, Json(body)).into_response()
    }
}

impl From<rbatis::Error> for AppError {
    fn from(e: rbatis::Error) -> Self {
        // 遍历 error source chain 输出完整错误链（release 构建也能看到有用信息）
        let chain = format_error_chain(&e);
        log::error!("DB error chain: {}", chain);
        AppError::Internal("Database operation failed".into())
    }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::BadRequest(format!("Invalid JSON: {}", e))
    }
}
