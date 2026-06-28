//! 日志路由 — /api/v1/logs
//! 公开接口，无需签名（崩溃时设备可能未注册）
//! 但有 rate limiting：同一 device_id 每分钟最多 1 次上报

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::log_service;
use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new().route("/logs", post(report_log))
}

#[derive(Debug, Deserialize)]
pub struct ReportLogRequest {
    pub device_id: Option<String>,
    pub platform: Option<String>,
    pub version: Option<String>,
    pub log_type: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct LogResponse {
    success: bool,
}

/// POST /logs — 上报日志（限频：同一 device_id 每分钟最多 1 次）
async fn report_log(
    State(state): State<AppState>,
    Json(body): Json<ReportLogRequest>,
) -> Result<(axum::http::StatusCode, Json<LogResponse>), AppError> {
    // 限频检查
    let did = body.device_id.as_deref().unwrap_or("");
    if !did.is_empty() && !state.check_log_rate(did).await {
        return Err(AppError::BadRequest("日志上报过于频繁，请稍后再试".into()));
    }

    log_service::report_log(
        state.db.clone(),
        did,
        body.platform.as_deref().unwrap_or(""),
        body.version.as_deref().unwrap_or(""),
        &body.log_type,
        &body.content,
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(LogResponse { success: true }),
    ))
}
