//! 日志路由 — /api/v1/logs
//! 公开接口，无需签名（崩溃时设备可能未注册）

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

/// POST /logs — 上报日志
async fn report_log(
    State(state): State<AppState>,
    Json(body): Json<ReportLogRequest>,
) -> Result<(axum::http::StatusCode, Json<LogResponse>), AppError> {
    log_service::report_log(
        state.db.clone(),
        body.device_id.as_deref().unwrap_or(""),
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
