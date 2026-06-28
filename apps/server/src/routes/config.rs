//! 配置路由 — /api/v1/config
//! 迁移自 IMWallet routes/config.ts (4 个接口)
//! 密码字段使用 RSA 加密传输，服务端解密后比对

use crate::errors::AppError;
use crate::middleware::{AppState, DevicePayload};
use crate::services::config_service;
use axum::{
    extract::{Query, State},
    routing::{get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::Digest;

/// XOR 掩码魔数（无规律常量）
/// device_cap: 管理权限 — 匹配 code → ADMIN_PERM_MARKER，不匹配 → DENY_MARKER
const ADMIN_PERM_MARKER: u32 = 0x5E2D8A37;
const DENY_MARKER: u32 = 0xD4E6F28A;
/// recharge_cap: 充值权限 — permitted → PERM_MARKER，not permitted → DENY_MARKER
const PERM_MARKER: u32 = 0x7B3A9C1F;

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

/// GET /config/all 可选 query 参数
#[derive(Debug, Deserialize, Default)]
struct ConfigAllQuery {
    /// 可选：反馈匹配后返回的 code，用于验证管理权限
    #[serde(default)]
    code: String,
}

/// GET /config/all — 获取所有配置项
/// - 过滤掉 server_pwd / recharge_allowed_devices / admin_activation_key 等敏感项
/// - 注入 device_cap：基于 code 验证结果 XOR 掩码编码管理权限（两级）
/// - 注入 recharge_cap：基于充值白名单 XOR 掩码编码充值权限（两级）
async fn get_all_configs(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Query(query): Query<ConfigAllQuery>,
) -> Result<Json<Vec<ConfigItem>>, AppError> {
    let configs = config_service::get_all_configs(state.db.clone()).await?;

    // 过滤不暴露的配置项
    let mut items: Vec<ConfigItem> = configs
        .into_iter()
        .filter(|c| !HIDDEN_KEYS.contains(&c.key.as_str()))
        .map(ConfigItem::from)
        .collect();

    // 设备 ID 前 8 位 hex 作为 seed
    let seed_hex = if device.device_id.len() >= 8 {
        &device.device_id[0..8]
    } else {
        "00000000"
    };
    let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);

    // ── device_cap：管理权限（两级）──
    // 如果传了 code，用 admin_activation_key SHA256 截断 XOR 验证
    let manage_permitted = if !query.code.is_empty() {
        config_service::verify_feedback_code(state.db.clone(), &device.device_id, &query.code)
            .await?
    } else {
        false
    };
    let device_cap_mask: u32 = if manage_permitted {
        seed_num ^ ADMIN_PERM_MARKER
    } else {
        seed_num ^ DENY_MARKER
    };
    items.push(ConfigItem {
        key: "device_cap".to_string(),
        value: format!("{:08x}", device_cap_mask),
    });

    // ── recharge_cap：充值权限（两级）──
    let recharge_permitted =
        config_service::is_recharge_permitted(state.db.clone(), &device.device_id).await?;
    let recharge_cap_mask: u32 = if recharge_permitted {
        seed_num ^ PERM_MARKER
    } else {
        seed_num ^ DENY_MARKER
    };
    items.push(ConfigItem {
        key: "recharge_cap".to_string(),
        value: format!("{:08x}", recharge_cap_mask),
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
    const PROTECTED_KEYS: &[&str] = &[
        "server_pwd",
        "recharge_allowed_devices",
        "admin_activation_key",
    ];
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

// ── 反馈建议 ──

#[derive(Debug, Deserialize)]
struct FeedbackRequest {
    /// 反馈内容（用户输入的文本）
    content: String,
    /// 可选联系方式
    #[serde(default)]
    #[allow(dead_code)]
    contact: String,
}

#[derive(Debug, Serialize)]
struct FeedbackResponse {
    message: String,
    /// 匹配关键词后返回 code（SHA256(admin_activation_key) 截断 XOR device_id_seed）
    /// 不匹配时为 None
    code: Option<String>,
}

/// POST /config/feedback — 提交反馈建议
async fn submit_feedback(
    State(state): State<AppState>,
    Extension(device): Extension<DevicePayload>,
    Json(body): Json<FeedbackRequest>,
) -> Result<Json<FeedbackResponse>, AppError> {
    // 1. 读取激活关键字（存储在 app_configs，运维可随时修改）
    let activation_key = config_service::get_activation_key(state.db.clone()).await?;
    let matched = !activation_key.is_empty() && body.content.trim() == activation_key;

    // 2. 匹配时计算 code（与 verify_feedback_code 同算法：SHA256(key) 截断 XOR seed）
    let code = if matched {
        log::info!("Admin activation matched for device {}", device.device_id);
        // 使用 SHA256(admin_activation_key) 截断作为掩码，与 device_id_seed XOR
        let hash_bytes = sha2::Sha256::digest(activation_key.as_bytes());
        let mask: u32 =
            u32::from_be_bytes([hash_bytes[0], hash_bytes[1], hash_bytes[2], hash_bytes[3]]);
        let seed_hex = if device.device_id.len() >= 8 {
            &device.device_id[0..8]
        } else {
            "00000000"
        };
        let seed_num: u32 = u32::from_str_radix(seed_hex, 16).unwrap_or(0);
        Some(format!("{:08x}", seed_num ^ mask))
    } else {
        None
    };

    // 3. 返回感谢信息
    Ok(Json(FeedbackResponse {
        message: "感谢您的反馈，我们会认真阅读并持续改进产品！".to_string(),
        code,
    }))
}
