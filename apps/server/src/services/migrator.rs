//! Flyway 数据库迁移门控
//! 使用 flyway 0.7 MigrationRunner 驱动迁移
//!
//! RbatisExecutor 和 RbatisStateManager 仅在迁移时使用，
//! 已从 db/ 模块移入此处，减少模块暴露。

use crate::db::query::vals;
use crate::errors::AppError;
use flyway::{
    ChangelogFile, MigrationExecutor, MigrationRunner, MigrationState, MigrationStateManager,
    MigrationStatus, MigrationsError, RuntimeMigrationStore,
};
use log::info;
use rbatis::RBatis;
use std::sync::Arc;
use tokio::sync::Mutex;

/// flyway 的 Result 类型别名：std::result::Result<T, MigrationsError>
type FlyResult<T> = std::result::Result<T, MigrationsError>;

// ── RbatisExecutor（仅迁移时使用） ──

struct RbatisExecutor {
    rb: Arc<RBatis>,
    tx: Mutex<Option<rbatis::executor::RBatisTxExecutor>>,
}

impl RbatisExecutor {
    fn new(rb: Arc<RBatis>) -> Self {
        Self {
            rb,
            tx: Mutex::new(None),
        }
    }
}

#[async_trait::async_trait]
impl MigrationExecutor for RbatisExecutor {
    async fn begin_transaction(&self) -> FlyResult<()> {
        let tx = self
            .rb
            .acquire_begin()
            .await
            .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        *self.tx.lock().await = Some(tx);
        Ok(())
    }

    async fn execute_changelog_file(&self, changelog: &ChangelogFile) -> FlyResult<()> {
        let guard = self.tx.lock().await;
        let tx = guard.as_ref().ok_or_else(|| {
            MigrationsError::migration_database_failed(
                None,
                None::<Box<dyn std::error::Error + Send + Sync>>,
            )
        })?;
        for stmt in changelog.iter() {
            let sql = stmt.statement.trim().to_string();
            if sql.is_empty() || sql.starts_with("--") {
                continue;
            }
            tx.exec(&sql, vec![]).await.map_err(|e| {
                MigrationsError::migration_database_step_failed(
                    Some(changelog.version as u32),
                    Some(Box::new(e)),
                )
            })?;
        }
        Ok(())
    }

    async fn commit_transaction(&self) -> FlyResult<()> {
        let mut guard = self.tx.lock().await;
        if let Some(tx) = guard.take() {
            tx.commit()
                .await
                .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        }
        Ok(())
    }

    async fn rollback_transaction(&self) -> FlyResult<()> {
        let mut guard = self.tx.lock().await;
        if let Some(tx) = guard.take() {
            tx.rollback()
                .await
                .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        }
        Ok(())
    }
}

// ── RbatisStateManager（仅迁移时使用） ──

struct RbatisStateManager {
    rb: Arc<RBatis>,
}

impl RbatisStateManager {
    fn new(rb: Arc<RBatis>) -> Self {
        Self { rb }
    }
}

#[async_trait::async_trait]
impl MigrationStateManager for RbatisStateManager {
    async fn prepare(&self) -> FlyResult<()> {
        self.rb
            .exec(
                "CREATE TABLE IF NOT EXISTS _flyway_schema_history (version BIGINT PRIMARY KEY, name VARCHAR(255) NOT NULL, checksum BIGINT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'DEPLOYED', deployed_at TIMESTAMP NOT NULL DEFAULT NOW())",
                vec![],
            )
            .await
            .map_err(|e| MigrationsError::migration_setup_failed(Some(Box::new(e))))
            .map(|_| ())
    }

    async fn lowest_version(&self) -> FlyResult<Option<MigrationState>> {
        let rows: Vec<(i64, String)> = self
            .rb
            .exec_decode(
                "SELECT version, status FROM _flyway_schema_history ORDER BY version ASC LIMIT 1",
                vec![],
            )
            .await
            .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        Ok(rows.into_iter().next().map(|(v, s)| MigrationState {
            version: v as u64,
            status: if s == "IN_PROGRESS" {
                MigrationStatus::InProgress
            } else {
                MigrationStatus::Deployed
            },
        }))
    }

    async fn highest_version(&self) -> FlyResult<Option<MigrationState>> {
        let rows: Vec<(i64, String)> = self
            .rb
            .exec_decode(
                "SELECT version, status FROM _flyway_schema_history ORDER BY version DESC LIMIT 1",
                vec![],
            )
            .await
            .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        Ok(rows.into_iter().next().map(|(v, s)| MigrationState {
            version: v as u64,
            status: if s == "IN_PROGRESS" {
                MigrationStatus::InProgress
            } else {
                MigrationStatus::Deployed
            },
        }))
    }

    async fn list_versions(&self) -> FlyResult<Vec<MigrationState>> {
        let rows: Vec<(i64, String)> = self
            .rb
            .exec_decode(
                "SELECT version, status FROM _flyway_schema_history ORDER BY version",
                vec![],
            )
            .await
            .map_err(|e| MigrationsError::migration_database_failed(None, Some(Box::new(e))))?;
        Ok(rows
            .into_iter()
            .map(|(v, s)| MigrationState {
                version: v as u64,
                status: if s == "IN_PROGRESS" {
                    MigrationStatus::InProgress
                } else {
                    MigrationStatus::Deployed
                },
            })
            .collect())
    }

    async fn begin_version(&self, changelog: &ChangelogFile) -> FlyResult<()> {
        self.rb
            .exec(
                "INSERT INTO _flyway_schema_history (version, name, checksum, status) VALUES ($1, $2, $3, 'IN_PROGRESS') ON CONFLICT (version) DO UPDATE SET status = 'IN_PROGRESS'",
                vals![changelog.version as i64, &changelog.name, changelog.checksum as i64],
            )
            .await
            .map_err(|e| MigrationsError::migration_versioning_failed(Some(Box::new(e))))
            .map(|_| ())
    }

    async fn finish_version(&self, changelog: &ChangelogFile) -> FlyResult<()> {
        self.rb
            .exec(
                "UPDATE _flyway_schema_history SET status = 'DEPLOYED', deployed_at = NOW() WHERE version = $1",
                vals![changelog.version as i64],
            )
            .await
            .map_err(|e| MigrationsError::migration_versioning_failed(Some(Box::new(e))))
            .map(|_| ())
    }

    async fn skip_version(&self, changelog: &ChangelogFile) -> FlyResult<()> {
        self.rb
            .exec(
                "UPDATE _flyway_schema_history SET status = 'SKIPPED' WHERE version = $1",
                vals![changelog.version as i64],
            )
            .await
            .map_err(|e| MigrationsError::migration_versioning_failed(Some(Box::new(e))))
            .map(|_| ())
    }
}

// ── 迁移入口 ──

pub async fn migrate(db: Arc<RBatis>) -> std::result::Result<(), AppError> {
    info!("Running flyway migrations...");

    // 1. 文件系统扫描 —— V*.sql 文件自动发现
    let store = RuntimeMigrationStore::new("migrations");

    // 2. 状态管理 —— _flyway_schema_history 表
    let state_manager = Arc::new(RbatisStateManager::new(db.clone()));

    // 3. SQL 执行器 —— 事务内逐句执行
    let executor = Arc::new(RbatisExecutor::new(db.clone()));

    // 4. 组装 Runner，按版本升序执行未应用版本
    let runner = MigrationRunner::new(store, state_manager, executor, false);

    if let Err(e) = runner.migrate().await {
        // 将 flyway 错误分类输出到日志，方便排查
        // 常见原因：数据库连接失败、SQL 语法错误、表已存在冲突、种子数据冲突等
        log::error!(
            "Flyway migration failed — error kind: {:?}, detail: {}",
            e.kind(),
            e
        );
        // 如果有最后成功版本号，额外输出
        if let Some(ver) = e.last_successful_version() {
            log::error!("  Last successful migration version: V{}", ver);
        }
        // 输出完整错误链（含底层 rbatis / postgres 错误）
        log::error!("  Full error: {:?}", e);
        return Err(AppError::Internal(format!(
            "Flyway migration failed: {}",
            e
        )));
    }

    info!("Flyway migrations completed");
    Ok(())
}
