//! 配置路由 — /api/v1/config
//! 迁移自 IMWallet routes/config.ts (4 个接口)

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::services::config_service;
use axum::{
    extract::State,
    routing::{get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};

/// XOR 掩码魔数（无规律常量，用于编码充值权限）
const PERM_MARKER: u32 = 0x7B3A9C1F;
const DENY_MARKER: u32 = 0xD4E6F28A;

/// 不暴露给前端的配置项（仅敏感项）
const HIDDEN_KEYS: &[&str] = &["server_pwd", "recharge_allowed_devices"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config/all", get(get_all_configs))
        .route("/config/verify-password", post(verify_password))
        .route("/config/update", put(update_config))
}

#[derive(Debug, Serialize)]
struct ConfigItem {
    key: String,
    value: String,
}

impl From<crate::models::AppConfigEntity> for ConfigItem {
    fn from(c: crate::models::AppConfigEntity) -> Self {
        Self {
            key: c.key,
            value: c.value,
        }
    }
}

/// GET /config/all — 获取所有配置项
/// - 过滤掉 server_pwd / recharge_allowed_devices 等敏感项
/// - 注入 device_cap：基于设备 ID XOR 掩码编码的充值权限标识
async fn get_all_configs(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
) -> Result<Json<Vec<ConfigItem>>, AppError> {
    let configs = config_service::get_all_configs(state.db.clone()).await?;

    // 过滤不暴露的配置项
    let mut items: Vec<ConfigItem> = configs
        .into_iter()
        .filter(|c| !HIDDEN_KEYS.contains(&c.key.as_str()))
        .map(ConfigItem::from)
        .collect();

    // 计算 device_cap：取设备 ID 前 8 位 hex 作为 seed，XOR 掩码编码权限
    let permitted =
        config_service::is_recharge_permitted(state.db.clone(), &device.device_id).await?;
    let seed_hex = if device.device_id.len() >= 8 {
        &device.device_id[0..8]
    } else {
        "00000000"
    };
    let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);
    let mask: u32 = if permitted {
        seed_num ^ PERM_MARKER
    } else {
        seed_num ^ DENY_MARKER
    };
    let cap_value = format!("{:08x}", mask);
    items.push(ConfigItem {
        key: "device_cap".to_string(),
        value: cap_value,
    });

    Ok(Json(items))
}

#[derive(Debug, Deserialize)]
pub struct VerifyPasswordRequest {
    pub password: String,
}

#[derive(Debug, Serialize)]
struct VerifyPasswordResponse {
    verified: bool,
}

/// POST /config/verify-password — 验证服务配置密码
async fn verify_password(
    State(state): State<AppState>,
    Json(body): Json<VerifyPasswordRequest>,
) -> Result<Json<VerifyPasswordResponse>, AppError> {
    let verified =
        config_service::verify_service_password(state.db.clone(), &body.password).await?;
    if verified {
        Ok(Json(VerifyPasswordResponse { verified: true }))
    } else {
        Err(AppError::Forbidden("密码验证失败".into()))
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub key: String,
    pub value: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
struct UpdateConfigResponse {
    key: String,
    value: String,
}

/// PUT /config/update — 更新配置项（需密码验证）
/// 禁止通过 API 修改 server_pwd 和 recharge_allowed_devices，这两个字段仅由运维人员直接修改数据库
async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<UpdateConfigRequest>,
) -> Result<Json<UpdateConfigResponse>, AppError> {
    // 黑名单：不允许通过 API 修改的配置项
    const PROTECTED_KEYS: &[&str] = &["server_pwd", "recharge_allowed_devices"];
    if PROTECTED_KEYS.contains(&body.key.as_str()) {
        return Err(AppError::Forbidden(format!(
            "配置项 '{}' 仅允许运维人员通过数据库直接修改",
            body.key
        )));
    }

    // 先验证管理密码
    let verified =
        config_service::verify_service_password(state.db.clone(), &body.password).await?;
    if !verified {
        return Err(AppError::Forbidden("管理密码验证失败".into()));
    }
    let config = config_service::update_config(state.db.clone(), &body.key, &body.value).await?;
    Ok(Json(UpdateConfigResponse {
        key: config.key,
        value: config.value,
    }))
}
