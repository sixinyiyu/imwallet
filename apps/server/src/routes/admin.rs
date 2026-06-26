//! 管理路由 — /api/v1/admin
//! 需要 device_auth + SERVER_PWD 双重验证

use crate::db::query::{query, vals};
use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::config_service;
use axum::{
    extract::{Path, State},
    routing::post,
    Json, Router,
};
use rbdc::DateTime;
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/devices", post(list_devices))
        .route("/admin/devices/{id}", post(get_device_detail))
        .route(
            "/admin/devices/{id}/transactions",
            post(get_device_transactions),
        )
        .route("/admin/devices/{id}/recharges", post(get_device_recharges))
}

// ── 密码验证 ──

#[derive(Debug, Deserialize)]
pub struct AdminAuth {
    pub password: String,
}

fn verify_admin(state: &AppState, password: &str) -> Result<(), AppError> {
    let verified = config_service::verify_service_password_sync(password, &state.config);
    if verified {
        Ok(())
    } else {
        Err(AppError::Forbidden("管理密码验证失败".into()))
    }
}

// ── 设备列表 ──

#[derive(Debug, Serialize)]
struct DeviceListItem {
    id: String,
    platform: String,
    online: bool,
    wallet_count: i64,
    last_active_at: Option<DateTime>,
    created_at: Option<DateTime>,
}

/// POST /admin/devices — 设备列表（需 device_auth + 密码验证）
async fn list_devices(
    State(state): State<AppState>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<Vec<DeviceListItem>>, AppError> {
    verify_admin(&state, &auth.password)?;

    #[derive(serde::Deserialize)]
    struct Row {
        id: String,
        platform: String,
        last_active_at: Option<DateTime>,
        created_at: Option<DateTime>,
        wallet_count: i64,
    }

    let rows: Vec<Row> = query(
        &state.db,
        "SELECT d.id, d.platform, d.last_active_at, d.created_at, COUNT(ws.wallet_id) as wallet_count FROM devices d LEFT JOIN wallet_subscriptions ws ON ws.device_id = d.id AND ws.address_id != '' GROUP BY d.id, d.platform, d.last_active_at, d.created_at ORDER BY d.last_active_at DESC NULLS LAST, d.created_at DESC",
        vals![],
    )
    .await?;

    let now_ts = chrono::Utc::now().timestamp();
    let items: Vec<DeviceListItem> = rows
        .into_iter()
        .map(|r| {
            let online = r
                .last_active_at
                .clone()
                .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);
            DeviceListItem {
                id: r.id,
                platform: r.platform,
                online,
                wallet_count: r.wallet_count,
                last_active_at: r.last_active_at,
                created_at: r.created_at,
            }
        })
        .collect();

    Ok(Json(items))
}

// ── 设备详情 ──

#[derive(Debug, Serialize)]
struct WalletBrief {
    wallet_id: String,
    alias: String,
    source: String,
    chain: String,
    address: String,
}

#[derive(Debug, Serialize)]
struct DeviceDetailResponse {
    id: String,
    platform: String,
    online: bool,
    last_active_at: Option<DateTime>,
    created_at: Option<DateTime>,
    wallets: Vec<WalletBrief>,
}

/// POST /admin/devices/:id — 设备详情（需 device_auth + 密码验证）
async fn get_device_detail(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<DeviceDetailResponse>, AppError> {
    verify_admin(&state, &auth.password)?;

    #[derive(serde::Deserialize)]
    struct DeviceRow {
        id: String,
        platform: String,
        last_active_at: Option<DateTime>,
        created_at: Option<DateTime>,
    }

    let device: DeviceRow = query(
        &state.db,
        "SELECT id, platform, last_active_at, created_at FROM devices WHERE id = $1",
        vals![&device_id],
    )
    .await?
    .into_iter()
    .next()
    .ok_or_else(|| AppError::NotFound("设备不存在".into()))?;

    #[derive(serde::Deserialize)]
    struct WalletRow {
        wallet_id: String,
        alias: String,
        source: String,
        chain: String,
        address: String,
    }

    let wallets: Vec<WalletRow> = query(
        &state.db,
        "SELECT ws.wallet_id, w.alias, w.source, wa.chain, wa.address FROM wallet_subscriptions ws JOIN wallets w ON w.id = ws.wallet_id JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.device_id = $1 AND ws.address_id != '' ORDER BY ws.wallet_id, wa.chain",
        vals![&device_id],
    )
    .await?;

    let now_ts = chrono::Utc::now().timestamp();
    let online = device
        .last_active_at
        .clone()
        .is_some_and(|la| (now_ts - la.unix_timestamp()).abs() <= 300);

    Ok(Json(DeviceDetailResponse {
        id: device.id,
        platform: device.platform,
        online,
        last_active_at: device.last_active_at,
        created_at: device.created_at,
        wallets: wallets
            .into_iter()
            .map(|w| WalletBrief {
                wallet_id: w.wallet_id,
                alias: w.alias,
                source: w.source,
                chain: w.chain,
                address: w.address,
            })
            .collect(),
    }))
}

// ── 设备交易记录 ──

/// POST /admin/devices/:id/transactions — 该设备的最近交易（需 device_auth + 密码验证）
async fn get_device_transactions(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<Vec<crate::models::Transaction>>, AppError> {
    verify_admin(&state, &auth.password)?;

    let rows: Vec<crate::models::Transaction> = query(
        &state.db,
        "WITH device_addr AS (SELECT DISTINCT wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.device_id = $1 AND ws.address_id != '') SELECT t.* FROM transactions t WHERE t.from_address IN (SELECT address FROM device_addr) OR t.to_address IN (SELECT address FROM device_addr) ORDER BY t.created_at DESC LIMIT 20",
        vals![&device_id],
    )
    .await?;

    Ok(Json(rows))
}

// ── 设备充值记录 ──

/// POST /admin/devices/:id/recharges — 该设备的最近充值记录（需 device_auth + 密码验证）
async fn get_device_recharges(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Json(auth): Json<AdminAuth>,
) -> Result<Json<Vec<crate::models::Recharge>>, AppError> {
    verify_admin(&state, &auth.password)?;

    let rows: Vec<crate::models::Recharge> = query(
        &state.db,
        "SELECT * FROM recharges WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20",
        vals![&device_id],
    )
    .await?;

    Ok(Json(rows))
}
