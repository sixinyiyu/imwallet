//! 数据库连接与初始化模块
//! 使用 rbdc-pool-fast (FastPool) 连接池

pub mod query;

use rbatis::RBatis;
use rbdc_pg::driver::PgDriver;
use rbdc_pool_fast::FastPool;

/// 初始化数据库连接池，返回 RBatis 实例（由调用方用 Arc 包装）
/// 接收完整连接 URL（由 AppConfig.database_full_url() 拼接）
/// 脱敏打印由调用方用 AppConfig.database_masked_url() 处理
pub fn init_db(database_url: &str) -> anyhow::Result<RBatis> {
    let pool = FastPool::new_url(PgDriver {}, database_url)
        .map_err(|e| anyhow::anyhow!("创建数据库连接池失败: {}", e))?;

    let rb = RBatis::new();
    rb.init_pool(pool)
        .map_err(|e| anyhow::anyhow!("初始化数据库池失败: {}", e))?;
    Ok(rb)
}
