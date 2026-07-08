//! 设备路由 — /api/v1/devices (1 个接口: 注册设备)

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::models::Device;
use crate::services::device_service;
use axum::{extract::State, routing::post, Json, Router};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/devices", post(register_device))
}

#[derive(Debug, Deserialize)]
struct RegisterDeviceRequest {
    device_id: String,
    platform: Option<String>,
}

#[derive(Debug, Serialize)]
struct DeviceResponse {
    id: String,
    platform: String,
    created_at: Option<DateTime>,
    updated_at: Option<DateTime>,
}

impl From<Device> for DeviceResponse {
    fn from(d: Device) -> Self {
        Self {
            id: d.id,
            platform: d.platform,
            created_at: d.created_at,
            updated_at: d.updated_at,
        }
    }
}

async fn register_device(
    State(state): State<AppState>,
    Json(body): Json<RegisterDeviceRequest>,
) -> Result<(axum::http::StatusCode, Json<DeviceResponse>), AppError> {
    let (device, created) = device_service::register_device(
        state.db.clone(),
        &body.device_id,
        body.platform.as_deref().unwrap_or("ios"),
    )
    .await?;
    let status = if created {
        axum::http::StatusCode::CREATED
    } else {
        axum::http::StatusCode::OK
    };
    Ok((status, Json(DeviceResponse::from(device))))
}
