//! 通知服务 — 迁移自 IMWallet services/notificationService.ts
//! 已读状态改为客户端本地管理，服务端只提供增量同步查询

use crate::db::query::{query, vals};
use crate::errors::AppError;
use fastdate::DateTime;
use rbatis::RBatis;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct NotificationResult {
    pub id: String,
    pub wallet_id: String,
    pub title: String,
    pub content: String,
    pub r#type: String,
    pub created_at: Option<DateTime>,
}

/// 获取设备的通知列表（基于订阅的钱包），支持增量同步
pub async fn get_notifications_by_device(
    rb: Arc<RBatis>,
    device_id: &str,
    since: Option<DateTime>,
) -> Result<Vec<NotificationResult>, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        id: String,
        wallet_id: String,
        title: String,
        content: String,
        r#type: String,
        created_at: Option<DateTime>,
    }

    let sql = if since.is_some() {
        "SELECT n.id, n.wallet_id, n.title, n.content, n.type as \"type\", n.created_at \
         FROM notifications n \
         JOIN wallet_subscriptions ws ON ws.wallet_id = n.wallet_id \
         WHERE ws.device_id = $1 AND n.created_at >= $2 \
         ORDER BY n.created_at DESC LIMIT 100"
    } else {
        "SELECT n.id, n.wallet_id, n.title, n.content, n.type as \"type\", n.created_at \
         FROM notifications n \
         JOIN wallet_subscriptions ws ON ws.wallet_id = n.wallet_id \
         WHERE ws.device_id = $1 \
         ORDER BY n.created_at DESC LIMIT 100"
    };

    let rows: Vec<R> = if let Some(s) = since {
        query(&rb, sql, vals![device_id, s]).await?
    } else {
        query(&rb, sql, vals![device_id]).await?
    };

    Ok(rows
        .into_iter()
        .map(|r| NotificationResult {
            id: r.id,
            wallet_id: r.wallet_id,
            title: r.title,
            content: r.content,
            r#type: r.r#type,
            created_at: r.created_at,
        })
        .collect())
}
