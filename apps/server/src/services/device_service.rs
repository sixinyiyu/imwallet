//! 设备服务
//! 迁移自 IMWallet services/deviceService.ts

use crate::db::query::{query_one, vals};
use crate::errors::AppError;
use crate::models::{Device, WalletSubscription};
use rbatis::RBatis;
use std::sync::Arc;

/// 注册设备 — INSERT ON CONFLICT 原子操作
/// 返回 (Device, bool)：bool 为 true 表示新建，false 表示已存在
pub async fn register_device(
    rb: Arc<RBatis>,
    device_id: &str,
    platform: &str,
) -> Result<(Device, bool), AppError> {
    let inserted: Option<Device> = query_one(
        &rb,
        "INSERT INTO devices (id, platform) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING *",
        vals![device_id, platform],
    )
    .await?;
    if let Some(d) = inserted {
        log::info!(
            "[设备] 注册成功 — ID={}, 平台={}, 新设备",
            &d.id,
            &d.platform
        );
        return Ok((d, true));
    }
    // ON CONFLICT 触发，设备已存在
    log::info!("[设备] 已存在 — ID={}, 平台={}", device_id, platform);
    let existing = get_device(rb, device_id)
        .await?
        .ok_or_else(|| AppError::Internal("设备注册失败".into()))?;
    Ok((existing, false))
}

pub async fn get_device(rb: Arc<RBatis>, device_id: &str) -> Result<Option<Device>, AppError> {
    query_one(&rb, "SELECT * FROM devices WHERE id = $1", vals![device_id])
        .await
        .map_err(AppError::from)
}

/// 订阅钱包 — INSERT ON CONFLICT 原子操作
/// ON CONFLICT 匹配 DDL 四列唯一索引 (wallet_id, device_id, chain, address_id)
/// 同一设备同一钱包不同链/地址可多次订阅；完全重复时忽略，返回已有记录
pub async fn subscribe_wallet(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
    chain: &str,
    address_id: &str,
) -> Result<WalletSubscription, AppError> {
    let inserted: Option<WalletSubscription> = query_one(
        &rb,
        "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, $3, $4) ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING RETURNING *",
        vals![wallet_id, device_id, chain, address_id],
    )
    .await?;
    if let Some(sub) = inserted {
        return Ok(sub);
    }
    // ON CONFLICT 触发，订阅已存在 — 查询已有记录返回，不报错
    let existing: WalletSubscription = query_one(
        &rb,
        "SELECT * FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2 AND chain = $3 AND address_id = $4",
        vals![wallet_id, device_id, chain, address_id],
    )
    .await?
    .ok_or_else(|| AppError::Internal("订阅查询失败".into()))?;
    Ok(existing)
}
