//! 配置路由 — /api/v1/config
//! 迁移自 IMWallet routes/config.ts (4 个接口)

use crate::errors::AppError;
use crate::middleware::AppState;
use crate::services::config_service;
use axum::{
    extract::State,
    routing::{get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config/fee", get(get_fee_config))
        .route("/config/all", get(get_all_configs))
        .route("/config/verify-password", post(verify_password))
        .route("/config/update", put(update_config))
}

#[derive(Debug, Serialize)]
struct FeeConfigResponse {
    fee_rate: f64,
    fee_mode: String,
}

/// GET /config/fee — 获取费率配置
async fn get_fee_config(
    State(state): State<AppState>,
) -> Result<Json<FeeConfigResponse>, AppError> {
    let config = config_service::get_fee_config(state.db.clone(), &state.config).await?;
    Ok(Json(FeeConfigResponse {
        fee_rate: config.fee_rate,
        fee_mode: config.fee_mode,
    }))
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
async fn get_all_configs(State(state): State<AppState>) -> Result<Json<Vec<ConfigItem>>, AppError> {
    let configs = config_service::get_all_configs(state.db.clone()).await?;
    Ok(Json(configs.into_iter().map(ConfigItem::from).collect()))
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
    let verified = config_service::verify_service_password(&body.password, &state.config).await?;
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
async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<UpdateConfigRequest>,
) -> Result<Json<UpdateConfigResponse>, AppError> {
    // 先验证管理密码
    let verified = config_service::verify_service_password_sync(&body.password, &state.config);
    if !verified {
        return Err(AppError::Forbidden("管理密码验证失败".into()));
    }
    let config = config_service::update_config(state.db.clone(), &body.key, &body.value).await?;
    Ok(Json(UpdateConfigResponse {
        key: config.key,
        value: config.value,
    }))
}
