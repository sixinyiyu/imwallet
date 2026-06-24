//! 通知路由 — /api/v1/notifications
//! 迁移自 IMWallet routes/notification.ts (3 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::services::notification_service;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Extension, Json, Router,
};
use serde::Serialize;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(get_notifications))
        .route("/notifications/{id}/read", put(mark_read))
        .route("/notifications/read-all", put(mark_all_read))
}

#[derive(Debug, Serialize)]
struct NotificationsResponse {
    notifications: Vec<notification_service::NotificationWithRead>,
}

/// GET /notifications — 获取通知列表
async fn get_notifications(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<NotificationsResponse>, AppError> {
    let notifications =
        notification_service::get_notifications_by_device(state.db.clone(), &device.device_id)
            .await?;
    Ok(Json(NotificationsResponse { notifications }))
}

#[derive(Debug, Serialize)]
struct MessageResponse {
    message: String,
}

/// PUT /notifications/:id/read — 标记单条已读
async fn mark_read(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(id): Path<String>,
) -> Result<Json<MessageResponse>, AppError> {
    notification_service::mark_read(state.db.clone(), &id, &device.device_id).await?;
    Ok(Json(MessageResponse {
        message: "Notification marked as read".into(),
    }))
}

/// PUT /notifications/read-all — 标记全部已读
async fn mark_all_read(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<MessageResponse>, AppError> {
    notification_service::mark_all_read_by_device(state.db.clone(), &device.device_id).await?;
    Ok(Json(MessageResponse {
        message: "All notifications marked as read".into(),
    }))
}
