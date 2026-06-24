//! 通知路由 — /api/v1/notifications
//! 已读状态改为客户端本地管理，服务端只提供增量同步

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::services::notification_service;
use axum::{
    extract::{Query, State},
    routing::get,
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new().route("/notifications/sync", get(sync_notifications))
}

#[derive(Debug, Deserialize)]
struct SyncQuery {
    since: Option<String>, // ISO 时间戳，增量同步用
}

#[derive(Debug, Serialize)]
struct SyncResponse {
    notifications: Vec<notification_service::NotificationResult>,
}

/// GET /notifications/sync?since=2026-06-24T00:00:00Z — 增量同步通知
async fn sync_notifications(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Query(params): Query<SyncQuery>,
) -> Result<Json<SyncResponse>, AppError> {
    let since = params
        .since
        .and_then(|s| chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S").ok());

    let notifications =
        notification_service::get_notifications_by_device(state.db.clone(), &device.device_id, since)
            .await?;
    Ok(Json(SyncResponse { notifications }))
}
