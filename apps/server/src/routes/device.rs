//! 设备路由 — /api/v1/devices (5 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::models::{Device, WalletSubscription};
use crate::services::device_service;
use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Extension, Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/devices", post(register_device))
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/devices/me", get(get_device_me))
        .route(
            "/devices/wallets",
            get(get_device_wallets).post(subscribe_wallet),
        )
        .route("/devices/wallets/{wallet_id}", delete(unsubscribe_wallet))
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

async fn get_device_me(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<DeviceResponse>, AppError> {
    let dev = device_service::get_device(state.db.clone(), &device.device_id)
        .await?
        .ok_or_else(|| AppError::NotFound("设备未注册".into()))?;
    Ok(Json(DeviceResponse::from(dev)))
}

#[derive(Debug, Deserialize)]
struct SubscribeWalletRequest {
    wallet_id: String,
    chain: Option<String>,
    address_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct SubscriptionResponse {
    id: Option<i32>,
    wallet_id: String,
    device_id: String,
    chain: String,
    address_id: String,
    created_at: Option<DateTime>,
}

impl From<WalletSubscription> for SubscriptionResponse {
    fn from(s: WalletSubscription) -> Self {
        Self {
            id: s.id,
            wallet_id: s.wallet_id,
            device_id: s.device_id,
            chain: s.chain,
            address_id: s.address_id,
            created_at: s.created_at,
        }
    }
}

async fn subscribe_wallet(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<SubscribeWalletRequest>,
) -> Result<(axum::http::StatusCode, Json<SubscriptionResponse>), AppError> {
    let sub = device_service::subscribe_wallet(
        state.db.clone(),
        &body.wallet_id,
        &device.device_id,
        body.chain.as_deref().unwrap_or(""),
        body.address_id.as_deref().unwrap_or(""),
    )
    .await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(SubscriptionResponse::from(sub)),
    ))
}

async fn unsubscribe_wallet(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Path(wallet_id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    device_service::unsubscribe_wallet(state.db.clone(), &wallet_id, &device.device_id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize)]
struct DeviceWalletsResponse {
    wallets: Vec<SubscriptionSummary>,
}

#[derive(Debug, Serialize)]
struct SubscriptionSummary {
    wallet_id: String,
    chain: String,
    address_id: String,
}

impl From<WalletSubscription> for SubscriptionSummary {
    fn from(s: WalletSubscription) -> Self {
        Self {
            wallet_id: s.wallet_id,
            chain: s.chain,
            address_id: s.address_id,
        }
    }
}

async fn get_device_wallets(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<DeviceWalletsResponse>, AppError> {
    let subs = device_service::get_device_wallets(state.db.clone(), &device.device_id).await?;
    Ok(Json(DeviceWalletsResponse {
        wallets: subs.into_iter().map(SubscriptionSummary::from).collect(),
    }))
}
