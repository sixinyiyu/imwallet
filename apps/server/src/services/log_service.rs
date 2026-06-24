//! 日志服务

use crate::db::query::{exec, vals};
use crate::errors::AppError;
use rbatis::RBatis;
use std::sync::Arc;

pub async fn report_log(
    rb: Arc<RBatis>,
    device_id: &str,
    platform: &str,
    version: &str,
    log_type: &str,
    content: &str,
) -> Result<(), AppError> {
    exec(&rb, "INSERT INTO app_logs (device_id, platform, version, log_type, content) VALUES ($1, $2, $3, $4, $5)", vals![device_id, platform, version, log_type, content]).await?;
    Ok(())
}
