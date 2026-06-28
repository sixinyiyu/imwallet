//! 配置路由 — /api/v1/config
//! 迁移自 IMWallet routes/config.ts (4 个接口)
//! 密码字段使用 RSA 加密传输，服务端解密后比对

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
/// 管理权限掩码（与 device_cap 机制一致，用于编码管理功能解锁标识）
const ADMIN_PERM_MARKER: u32 = 0x5E2D8A37;
const ADMIN_DENY_MARKER: u32 = 0xC1F4B7E9;

/// 不暴露给前端的配置项（仅敏感项）
const HIDDEN_KEYS: &[&str] = &[
    "server_pwd",
    "recharge_allowed_devices",
    "admin_activation_key",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/config/all", get(get_all_configs))
        .route("/config/verify-password", post(verify_password))
        .route("/config/update", put(update_config))
        .route("/config/feedback", post(submit_feedback))
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
/// - 过滤掉 server_pwd / recharge_allowed_devices / admin_activation_key 等敏感项
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
    /// RSA 公钥加密后的密码（Base64 编码）
    pub encrypted_password: String,
}

#[derive(Debug, Serialize)]
struct VerifyPasswordResponse {
    verified: bool,
}

/// POST /config/verify-password — 验证服务配置密码
/// 密码由前端 RSA 公钥加密传输，服务端私钥解密后比对
async fn verify_password(
    State(state): State<AppState>,
    Json(body): Json<VerifyPasswordRequest>,
) -> Result<Json<VerifyPasswordResponse>, AppError> {
    // RSA 私钥解密
    let password = state
        .rsa_keys
        .decrypt(&body.encrypted_password)
        .map_err(|_| AppError::BadRequest("密码解密失败".into()))?;

    let verified = config_service::verify_service_password(state.db.clone(), &password).await?;
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
    /// RSA 公钥加密后的密码（Base64 编码）
    pub encrypted_password: String,
}

#[derive(Debug, Serialize)]
struct UpdateConfigResponse {
    key: String,
    value: String,
}

/// PUT /config/update — 更新配置项（需密码验证）
/// 禁止通过 API 修改 server_pwd 和 recharge_allowed_devices，这两个字段仅由运维人员直接修改数据库
/// 密码由前端 RSA 公钥加密传输，服务端私钥解密后比对
async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<UpdateConfigRequest>,
) -> Result<Json<UpdateConfigResponse>, AppError> {
    // 黑名单：不允许通过 API 修改的配置项
    const PROTECTED_KEYS: &[&str] = &["server_pwd", "recharge_allowed_devices", "admin_activation_key"];
    if PROTECTED_KEYS.contains(&body.key.as_str()) {
        return Err(AppError::Forbidden(format!(
            "配置项 '{}' 仅允许运维人员通过数据库直接修改",
            body.key
        )));
    }

    // RSA 私钥解密密码
    let password = state
        .rsa_keys
        .decrypt(&body.encrypted_password)
        .map_err(|_| AppError::BadRequest("密码解密失败".into()))?;

    // 验证管理密码
    let verified = config_service::verify_service_password(state.db.clone(), &password).await?;
    if !verified {
        return Err(AppError::Forbidden("管理密码验证失败".into()));
    }
    let config = config_service::update_config(state.db.clone(), &body.key, &body.value).await?;
    Ok(Json(UpdateConfigResponse {
        key: config.key,
        value: config.value,
    }))
}

// ── 反馈建议（伪装入口：匹配激活关键字后返回管理权限标识） ──

#[derive(Debug, Deserialize)]
struct FeedbackRequest {
    /// 反馈内容（用户输入的文本）
    content: String,
    /// 可选联系方式
    #[serde(default)]
    contact: String,
}

#[derive(Debug, Serialize)]
struct FeedbackResponse {
    /// 通用回复（无论匹配与否都返回感谢信息，不泄露匹配结果）
    message: String,
    /// 管理权限标识（仅匹配成功时返回，类似 device_cap 的掩码编码）
    /// 前端收到后本地缓存，用于决定是否显示管理菜单项
    admin_cap: Option<String>,
}

/// POST /config/feedback — 提交反馈建议
/// 伪装入口：匹配到 admin_activation_key 关键字后返回 admin_cap，
/// 不知道关键信息的人看到的就是普通反馈表单
async fn submit_feedback(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<FeedbackRequest>,
) -> Result<Json<FeedbackResponse>, AppError> {
    // 1. 读取激活关键字（存储在 app_configs，运维可随时修改）
    let activation_key = config_service::get_activation_key(state.db.clone()).await?;
    let matched = !activation_key.is_empty()
        && body
            .content
            .trim()
            .contains(&activation_key);

    // 2. 计算 admin_cap（与 device_cap 机制一致：设备 ID seed XOR 掩码）
    let admin_cap = if matched {
        log::info!(
            "Admin activation matched for device {}",
            device.device_id
        );
        let seed_hex = if device.device_id.len() >= 8 {
            &device.device_id[0..8]
        } else {
            "00000000"
        };
        let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);
        let mask: u32 = seed_num ^ ADMIN_PERM_MARKER;
        Some(format!("{:08x}", mask))
    } else {
        // 不匹配 → 返回 deny 掩码，前端计算后不会解锁
        let seed_hex = if device.device_id.len() >= 8 {
            &device.device_id[0..8]
        } else {
            "00000000"
        };
        let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);
        let mask: u32 = seed_num ^ ADMIN_DENY_MARKER;
        Some(format!("{:08x}", mask))
    };

    // 3. 无论匹配与否，都返回感谢信息（不泄露匹配结果）
    Ok(Json(FeedbackResponse {
        message: "感谢您的反馈，我们会认真阅读并持续改进产品！".to_string(),
        admin_cap,
    }))
}
