//! 通知服务 — 迁移自 IMWallet services/notificationService.ts

use crate::db::query::{exec, query, vals};
use crate::errors::AppError;
use chrono::NaiveDateTime;
use rbatis::RBatis;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct NotificationWithRead {
    pub id: String,
    pub wallet_id: String,
    pub title: String,
    pub content: String,
    pub r#type: String,
    pub is_read: bool,
    pub created_at: Option<NaiveDateTime>,
}

/// 批量获取设备所有订阅钱包的通知（解决 N+1 查询）
pub async fn get_notifications_by_device(
    rb: Arc<RBatis>,
    device_id: &str,
) -> Result<Vec<NotificationWithRead>, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        id: String,
        wallet_id: String,
        title: String,
        content: String,
        r#type: String,
        is_read: Option<bool>,
        created_at: Option<NaiveDateTime>,
    }
    let rows: Vec<R> = query(
        &rb,
        "SELECT n.id, n.wallet_id, n.title, n.content, n.type as \"type\", COALESCE(nr.is_read, false) as is_read, n.created_at FROM notifications n JOIN wallet_subscriptions ws ON ws.wallet_id = n.wallet_id LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.device_id = $1 WHERE ws.device_id = $1 ORDER BY n.created_at DESC",
        vals![device_id],
    )
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| NotificationWithRead {
            id: r.id,
            wallet_id: r.wallet_id,
            title: r.title,
            content: r.content,
            r#type: r.r#type,
            is_read: r.is_read.unwrap_or(false),
            created_at: r.created_at,
        })
        .collect())
}

pub async fn mark_read(rb: Arc<RBatis>, nid: &str, device_id: &str) -> Result<(), AppError> {
    exec(
        &rb,
        "INSERT INTO notification_reads (notification_id, device_id, is_read, read_at, created_at) VALUES ($1, $2, true, NOW(), NOW()) ON CONFLICT (notification_id, device_id) DO UPDATE SET is_read = true, read_at = NOW()",
        vals![nid, device_id],
    )
    .await?;
    Ok(())
}

/// 批量标记所有订阅钱包的通知为已读（解决 N+1 查询）
pub async fn mark_all_read_by_device(rb: Arc<RBatis>, device_id: &str) -> Result<(), AppError> {
    exec(
        &rb,
        "INSERT INTO notification_reads (notification_id, device_id, is_read, read_at, created_at) SELECT n.id, $1, true, NOW(), NOW() FROM notifications n JOIN wallet_subscriptions ws ON ws.wallet_id = n.wallet_id WHERE ws.device_id = $1 AND NOT EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.notification_id = n.id AND nr.device_id = $1 AND nr.is_read = true) ON CONFLICT (notification_id, device_id) DO UPDATE SET is_read = true, read_at = NOW()",
        vals![device_id],
    )
    .await?;
    Ok(())
}
