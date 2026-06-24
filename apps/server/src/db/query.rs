//! 数据库查询辅助 — rbatis 4.9.x
//! SQL 执行失败时记录语句和参数摘要，便于排查

use rbatis::executor::RBatisTxExecutor;
use rbatis::RBatis;

macro_rules! vals { ($($e:expr),* $(,)?) => { vec![$(rbs::value!($e),)*] }; }
pub(crate) use vals;

/// 生成参数摘要（最多展示前 3 个参数，避免日志过长）
fn args_summary(args: &[rbs::value::Value]) -> String {
    if args.is_empty() {
        return "[]".into();
    }
    let display: Vec<String> = args.iter().take(3).map(|v| format!("{:?}", v)).collect();
    if args.len() > 3 {
        format!("[{}, ...({} more)]", display.join(", "), args.len() - 3)
    } else {
        format!("[{}]", display.join(", "))
    }
}

pub async fn query<T: serde::de::DeserializeOwned>(
    rb: &RBatis,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<Vec<T>, rbatis::Error> {
    let summary = args_summary(&args);
    rb.exec_decode(sql, args).await.inspect_err(|_| {
        log::error!("query failed — sql: {}, args: {}", sql, summary);
    })
}

pub async fn query_one<T: serde::de::DeserializeOwned>(
    rb: &RBatis,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<Option<T>, rbatis::Error> {
    let summary = args_summary(&args);
    let rows: Vec<T> = rb.exec_decode(sql, args).await.inspect_err(|_| {
        log::error!("query_one failed — sql: {}, args: {}", sql, summary);
    })?;
    Ok(rows.into_iter().next())
}

pub async fn query_count(
    rb: &RBatis,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<u64, rbatis::Error> {
    let summary = args_summary(&args);
    #[derive(serde::Deserialize)]
    struct C {
        cnt: Option<i64>,
    }
    let rows: Vec<C> = rb.exec_decode(sql, args).await.inspect_err(|_| {
        log::error!("query_count failed — sql: {}, args: {}", sql, summary);
    })?;
    Ok(rows.into_iter().next().and_then(|c| c.cnt).unwrap_or(0) as u64)
}

pub async fn exec(
    rb: &RBatis,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<rbdc::db::ExecResult, rbatis::Error> {
    let summary = args_summary(&args);
    rb.exec(sql, args).await.inspect_err(|_| {
        log::error!("exec failed — sql: {}, args: {}", sql, summary);
    })
}

pub async fn tx_query<T: serde::de::DeserializeOwned>(
    tx: &RBatisTxExecutor,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<Vec<T>, rbatis::Error> {
    let summary = args_summary(&args);
    let v = tx.query(sql, args).await.inspect_err(|_| {
        log::error!("tx_query failed — sql: {}, args: {}", sql, summary);
    })?;
    rbs::from_value(v)
}

pub async fn tx_query_one<T: serde::de::DeserializeOwned>(
    tx: &RBatisTxExecutor,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<Option<T>, rbatis::Error> {
    let rows: Vec<T> = tx_query(tx, sql, args).await?;
    Ok(rows.into_iter().next())
}

pub async fn tx_query_count(
    tx: &RBatisTxExecutor,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<u64, rbatis::Error> {
    #[derive(serde::Deserialize)]
    struct C {
        cnt: Option<i64>,
    }
    let rows: Vec<C> = tx_query(tx, sql, args).await?;
    Ok(rows.into_iter().next().and_then(|c| c.cnt).unwrap_or(0) as u64)
}

pub async fn tx_exec(
    tx: &RBatisTxExecutor,
    sql: &str,
    args: Vec<rbs::value::Value>,
) -> Result<rbdc::db::ExecResult, rbatis::Error> {
    let summary = args_summary(&args);
    tx.exec(sql, args).await.inspect_err(|_| {
        log::error!("tx_exec failed — sql: {}, args: {}", sql, summary);
    })
}
