//! 数据库连接与初始化模块
//! 使用 rbdc-pool-fast (FastPool) 连接池
//! 支持配置连接池大小和超时参数

pub mod query;

use rbatis::RBatis;
use rbdc::pool::Pool;
use rbdc_pg::driver::PgDriver;
use std::time::Duration;

/// 初始化数据库连接池，返回 RBatis 实例（由调用方用 Arc 包装）
/// 接收完整连接 URL（由 AppConfig.database_full_url() 拼接）
/// 脱敏打印由调用方用 AppConfig.database_masked_url() 处理
/// max_conn: 最大连接数（默认 20）
/// min_conn: 最小空闲连接数（默认 5）
/// timeout_secs: 获取连接超时秒数（默认 30）
pub async fn init_db(
    database_url: &str,
    max_conn: u32,
    min_conn: u32,
    timeout_secs: u64,
) -> anyhow::Result<RBatis> {
    let pool = rbdc_pool_fast::FastPool::new_url(PgDriver {}, database_url)
        .map_err(|e| anyhow::anyhow!("创建数据库连接池失败: {}", e))?;

    // 配置连接池参数（异步方法，直接 await 即可）
    pool.set_max_open_conns(max_conn as u64).await;
    pool.set_max_idle_conns(min_conn as u64).await;
    pool.set_timeout(Some(Duration::from_secs(timeout_secs)))
        .await;

    let rb = RBatis::new();
    rb.init_pool(pool)
        .map_err(|e| anyhow::anyhow!("初始化数据库池失败: {}", e))?;
    Ok(rb)
}
