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
        }
    }
}

#[derive(Serialize)]
struct ErrorResponse {
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();
        // C7: 仅返回 message，不暴露 debug 信息
        // Internal 变体只返回固定字符串，内部原因仅记日志
        let message = match &self {
            AppError::Internal(detail) => {
                log::error!(
                    "Internal error: {}\nBacktrace: {}",
                    detail,
                    std::backtrace::Backtrace::capture()
                );
                "Internal server error".to_string()
            }
            _ => self.to_string(),
        };
        let body = ErrorResponse { message };
        (status, Json(body)).into_response()
    }
}

impl From<rbatis::Error> for AppError {
    fn from(e: rbatis::Error) -> Self {
        let bt = std::backtrace::Backtrace::capture();
        log::error!("DB error: {:?}\n{}", e, bt);
        AppError::Internal("Database operation failed".into())
    }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::BadRequest(format!("Invalid JSON: {}", e))
    }
}
