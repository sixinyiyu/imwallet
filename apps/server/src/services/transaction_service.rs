//! 交易服务（转账核心）
//! 迁移自 IMWallet services/transactionService.ts (473行)

use crate::chain::address_validator;
use crate::config::{FeeMode, RuntimeConfig};
use crate::db::query::vals;
use crate::errors::AppError;
use rbatis::RBatis;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;

use crate::utils::short_addr;

// NotificationType 常量
const TRANSFER_IN: &str = "TRANSFER_IN";
const TRANSFER_OUT: &str = "TRANSFER_OUT";

#[derive(Debug, Deserialize)]
pub struct TransferInput {
    pub from_wallet_id: String,
    pub to_address: String,
    pub amount: Decimal,
    pub token_symbol: String,
    pub network: String,
    pub memo: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct TransferResult {
    pub id: String,
    pub tx_hash: String,
    pub from_address: String,
    pub to_address: String,
    pub amount: Decimal,
    pub fee: Decimal,
    pub received_amount: Decimal,
    pub fee_mode: String,
    pub status: String,
}

pub async fn execute_transfer(
    rb: Arc<RBatis>,
    input: TransferInput,
    device_id: &str,
    platform: &str,
    cfg: &RuntimeConfig,
) -> Result<TransferResult, AppError> {
    let t0 = std::time::Instant::now();
    // 校验收款地址格式与链类型匹配
    let v = address_validator::validate_address_for_chain(&input.to_address, &input.network);
    if !v.is_valid {
        return Err(AppError::BadRequest(
            v.error.unwrap_or_else(|| "收款地址格式无效".into()),
        ));
    }

    // ── 事务外：查询阶段（缩小事务持有时间） ──

    // 合并查询 from_addr + asset + balance（单次 DB 往返）
    let t1 = std::time::Instant::now();
    #[derive(serde::Deserialize)]
    struct FromInfo {
        address_id: String,
        from_address: String,
        asset_id: String,
        balance: Decimal,
    }
    let from_info: Vec<FromInfo> = crate::db::query::query(
        &rb,
        "SELECT wa.id as address_id, wa.address as from_address, a.id as asset_id, aa.balance
         FROM wallet_subscriptions ws
         JOIN wallets_addresses wa ON wa.id = ws.address_id
         JOIN assets a ON a.symbol = $2 AND a.chain = $3
         JOIN assets_addresses aa ON aa.address_id = wa.id AND aa.asset_id = a.id
         WHERE ws.wallet_id = $1 AND ws.device_id = $4 AND wa.chain = $3 AND ws.address_id != ''
         LIMIT 1",
        vals![
            &input.from_wallet_id,
            &input.token_symbol,
            &input.network,
            device_id
        ],
    )
    .await?;
    log::debug!(
        "[耗时] transfer 查询from_info {:.2}ms",
        t1.elapsed().as_millis() as f64
    );
    let from = from_info
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Forbidden("该钱包不属于当前设备或未找到发送方地址".into()))?;

    // 计算手续费
    let fee_rate = Decimal::from_f64_retain(cfg.fee_rate).unwrap_or(Decimal::new(5, 3));
    let fee_mode = FeeMode::from_str(&cfg.fee_mode);
    let fee = (input.amount * fee_rate).round_dp(6);
    let (received, total_debit) = match fee_mode {
        FeeMode::Deducted => ((input.amount - fee).round_dp(6), input.amount),
        FeeMode::Extra => (input.amount, (input.amount + fee).round_dp(6)),
    };
    if from.balance < total_debit {
        return Err(AppError::BadRequest("余额不足".into()));
    }

    // 查询 to_addr + restrict_check
    let t2 = std::time::Instant::now();
    #[derive(serde::Deserialize)]
    struct ToInfo {
        id: String,
    }
    let to_addr: Vec<ToInfo> = crate::db::query::query(
        &rb,
        "SELECT id FROM wallets_addresses WHERE address = $1 LIMIT 1",
        vals![&input.to_address],
    )
    .await?;
    log::debug!(
        "[耗时] transfer 查询to_addr {:.2}ms",
        t2.elapsed().as_millis() as f64
    );
    if cfg.tx_restrict_wallet && to_addr.is_empty() {
        return Err(AppError::BadRequest("收款地址不在系统内".into()));
    }

    // ── 事务内：写入阶段（只做余额变更 + 交易记录，缩小事务范围） ──
    let t3 = std::time::Instant::now();
    let tx = rb.acquire_begin().await?;
    log::debug!(
        "[耗时] transfer acquire_tx {:.2}ms",
        t3.elapsed().as_millis() as f64
    );

    // 扣款（带余额校验：AND balance >= $1，防止并发修改导致余额不足）
    #[derive(serde::Deserialize)]
    struct DeductResult {}
    let deducted: Option<DeductResult> = crate::db::query::tx_query_one(
        &tx,
        "UPDATE assets_addresses SET balance = balance - $1, updated_at = NOW() WHERE address_id = $2 AND asset_id = $3 AND balance >= $1 RETURNING id",
        vals![rbdc::Decimal::new(&total_debit.to_string()).unwrap(), &from.address_id, &from.asset_id],
    )
    .await?;
    if deducted.is_none() {
        return Err(AppError::BadRequest("余额不足（并发冲突）".into()));
    }

    // 加款
    if let Some(to) = to_addr.first() {
        crate::db::query::tx_exec(
            &tx,
            "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (address_id, asset_id) DO UPDATE SET balance = assets_addresses.balance + $5, updated_at = NOW()",
            vals![uuid::Uuid::new_v4().to_string(), &to.id, &from.asset_id, &input.network, rbdc::Decimal::new(&received.to_string()).unwrap()],
        )
        .await?;
    }

    // 插入交易记录
    let tx_id = uuid::Uuid::new_v4().to_string();
    let hash = format!(
        "{}{}{}{}{}",
        from.from_address,
        input.to_address,
        input.amount,
        uuid::Uuid::new_v4(),
        time::OffsetDateTime::now_utc()
    );
    let tx_hash = format!("0x{}", hex::encode(Sha256::digest(hash.as_bytes())));
    crate::db::query::tx_exec(
        &tx,
        "INSERT INTO transactions (id, tx_hash, from_address, to_address, token_symbol, amount, fee, status, memo, platform, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', $8, $9, NOW(), NOW())",
        vals![&tx_id, &tx_hash, &from.from_address, &input.to_address, &input.token_symbol, rbdc::Decimal::new(&input.amount.to_string()).unwrap(), rbdc::Decimal::new(&fee.to_string()).unwrap(), input.memo.as_deref().unwrap_or(""), platform],
    )
    .await?;

    tx.commit().await?;
    log::debug!(
        "[耗时] transfer 事务写入+commit {:.2}ms",
        t3.elapsed().as_millis() as f64
    );

    log::info!(
        "[转账] 完成 — 交易ID={}, 发送方(地址{}) -- {}({}) --> 接收方(地址{}), 转账金额 {} {}, 手续费 {}, 实到 {}, 手续费模式{}, 转账结果：已确认, 交易哈希{}, 总耗时 {:.2}ms",
        &tx_id,
        short_addr(&from.from_address),
        &input.token_symbol,
        &input.network,
        short_addr(&input.to_address),
        input.amount,
        &input.token_symbol,
        fee,
        received,
        &cfg.fee_mode,
        &tx_hash,
        t0.elapsed().as_millis() as f64
    );

    // ── 事务后：异步插入通知（不影响转账响应速度） ──
    let rb_clone = rb.clone();
    let from_wallet_id = input.from_wallet_id.clone();
    let token_symbol = input.token_symbol.clone();
    let network = input.network.clone();
    let amount_display = input.amount.round_dp(6);
    let received_display = received.round_dp(6);
    let to_addr_id = to_addr.first().map(|t| t.id.clone());
    let result_id = tx_id.clone();
    tokio::spawn(async move {
        if let Err(e) = spawn_insert_notifications(
            rb_clone,
            &tx_id,
            &from_wallet_id,
            &token_symbol,
            &network,
            amount_display,
            received_display,
            to_addr_id.as_deref(),
        )
        .await
        {
            log::warn!("[转账] 通知插入失败 — 交易ID={}, 错误={}", &tx_id, e);
        }
    });

    Ok(TransferResult {
        id: result_id,
        tx_hash,
        from_address: from.from_address,
        to_address: input.to_address,
        amount: input.amount,
        fee,
        received_amount: received,
        fee_mode: cfg.fee_mode.clone(),
        status: "CONFIRMED".into(),
    })
}

/// 异步插入转账通知（事务外执行，不影响转账响应速度）
/// 通知是"尽力而为"的副作用，失败不影响转账结果
#[allow(clippy::too_many_arguments)]
async fn spawn_insert_notifications(
    rb: Arc<RBatis>,
    tx_id: &str,
    from_wallet_id: &str,
    token_symbol: &str,
    network: &str,
    amount_display: Decimal,
    received_display: Decimal,
    to_addr_id: Option<&str>,
) -> Result<(), AppError> {
    // 查询接收方钱包的订阅者
    #[derive(serde::Deserialize)]
    struct W {
        wallet_id: String,
    }
    let to_wallets: Vec<W> = if let Some(addr_id) = to_addr_id {
        crate::db::query::query(
            &rb,
            "SELECT DISTINCT wallet_id FROM wallet_subscriptions WHERE address_id = $1",
            vals![addr_id],
        )
        .await?
    } else {
        Vec::new()
    };

    // 构建通知数据
    let out_meta = serde_json::json!({
        "transaction_id": tx_id,
        "token_symbol": token_symbol,
        "chain": network,
        "amount": amount_display.to_string()
    });
    let in_meta = serde_json::json!({
        "transaction_id": tx_id,
        "token_symbol": token_symbol,
        "chain": network,
        "amount": received_display.to_string()
    });
    let out_meta_str = serde_json::to_string(&out_meta).unwrap_or_default();
    let in_meta_str = serde_json::to_string(&in_meta).unwrap_or_default();
    let out_content = format!("转出 {} {}", amount_display, token_symbol);
    let in_content = format!("收到 {} {}", received_display, token_symbol);

    // 批量 INSERT 通知（1次 DB 往返）
    let total_notifs = 1 + to_wallets.len();
    let mut notif_args: Vec<rbs::value::Value> = Vec::new();
    let placeholders: Vec<String> = (0..total_notifs)
        .enumerate()
        .map(|(i, _)| {
            let base = i * 7 + 1;
            format!(
                "(${}, ${}, ${}, ${}, ${}, ${}, NOW())",
                base,
                base + 1,
                base + 2,
                base + 3,
                base + 4,
                base + 5
            )
        })
        .collect();

    // 转出通知
    notif_args.push(rbs::value::Value::String(uuid::Uuid::new_v4().to_string()));
    notif_args.push(rbs::value::Value::String(from_wallet_id.to_string()));
    notif_args.push(rbs::value::Value::String("转账成功".to_string()));
    notif_args.push(rbs::value::Value::String(out_content));
    notif_args.push(rbs::value::Value::String(TRANSFER_OUT.to_string()));
    notif_args.push(rbs::value::Value::String(out_meta_str));

    // 收款通知
    for w in &to_wallets {
        notif_args.push(rbs::value::Value::String(uuid::Uuid::new_v4().to_string()));
        notif_args.push(rbs::value::Value::String(w.wallet_id.clone()));
        notif_args.push(rbs::value::Value::String("收到转账".to_string()));
        notif_args.push(rbs::value::Value::String(in_content.clone()));
        notif_args.push(rbs::value::Value::String(TRANSFER_IN.to_string()));
        notif_args.push(rbs::value::Value::String(in_meta_str.clone()));
    }

    let notif_sql = format!(
        "INSERT INTO notifications (id, wallet_id, title, content, type, metadata, created_at) VALUES {}",
        placeholders.join(", ")
    );
    crate::db::query::exec(&rb, &notif_sql, notif_args).await?;
    Ok(())
}

pub async fn check_address(rb: Arc<RBatis>, address: &str) -> Result<bool, AppError> {
    let cnt = crate::db::query::query_count(
        &rb,
        "SELECT COUNT(*) as cnt FROM wallets_addresses WHERE address = $1",
        vals![address],
    )
    .await?;
    Ok(cnt > 0)
}

/// 获取钱包交易记录 — UNION ALL + SQL 级分页
/// PG 对 OR 条件优化不如两条独立查询，分别走索引更高效。
/// 策略：
///   1. 查询钱包地址列表
///   2. UNION ALL 合并 from/to 两条分支
///   3. 外层 DISTINCT 去重 + ORDER BY + LIMIT/OFFSET 分页
///   4. 窗口函数 COUNT(*) OVER() 获取总数（单次查询）
pub async fn get_transactions(
    rb: Arc<RBatis>,
    wallet_id: &str,
    token_symbol: Option<&str>,
    page: u64,
    limit: u64,
) -> Result<(Vec<crate::models::Transaction>, u64), AppError> {
    let offset = ((page - 1) * limit) as i64;
    let l = limit as i64;
    use crate::db::query::query;

    // ── Step 1: 查询钱包地址列表 ──
    #[derive(serde::Deserialize)]
    struct AddrRow {
        address: String,
    }
    let addr_rows: Vec<AddrRow> = query(
        &rb,
        "SELECT DISTINCT wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND ws.address_id != ''",
        vals![wallet_id],
    )
    .await?;
    let addresses: Vec<String> = addr_rows.iter().map(|r| r.address.clone()).collect();

    if addresses.is_empty() {
        return Ok((Vec::new(), 0));
    }

    // ── Step 2: 构建参数化 IN 子句 ──
    let n = addresses.len();
    let (in_ph, in_args) = crate::db::query::in_clause(&addresses, 1);

    // ── Step 3: 构建 UNION ALL + SQL 级分页 ──
    // token_symbol 过滤条件（可选）
    let (token_cond, sym_arg) = if let Some(sym) = token_symbol {
        (format!(" AND t.token_symbol = ${}", n + 1), Some(sym))
    } else {
        (String::new(), None)
    };

    // LIMIT/OFFSET 参数编号：
    //   无 token_symbol: 第 2n+1 个参数是 LIMIT，第 2n+2 个是 OFFSET
    //   有 token_symbol: 第 2n+3 个参数是 LIMIT，第 2n+4 个是 OFFSET
    let limit_ph = if sym_arg.is_some() {
        format!("${}", 2 * n + 3)
    } else {
        format!("${}", 2 * n + 1)
    };
    let offset_ph = if sym_arg.is_some() {
        format!("${}", 2 * n + 4)
    } else {
        format!("${}", 2 * n + 2)
    };

    let sql = format!(
        "WITH combined AS (
            SELECT t.id, t.from_address, t.to_address, t.token_symbol, t.amount, t.fee, t.memo, t.platform, t.created_at
            FROM transactions t WHERE t.from_address IN {in_ph}{token_cond}
            UNION ALL
            SELECT t.id, t.from_address, t.to_address, t.token_symbol, t.amount, t.fee, t.memo, t.platform, t.created_at
            FROM transactions t WHERE t.to_address IN {in_ph}{token_cond}
        )
        SELECT DISTINCT id, from_address, to_address, token_symbol, amount, fee, memo, platform, created_at,
            COUNT(*) OVER() as total_count
        FROM combined
        ORDER BY created_at DESC
        LIMIT {limit_ph} OFFSET {offset_ph}",
        in_ph = in_ph,
        token_cond = token_cond,
        limit_ph = limit_ph,
        offset_ph = offset_ph,
    );

    // 构建参数：from IN + to IN + (可选 token_symbol × 2) + LIMIT + OFFSET
    let mut args = in_args.clone();
    // to_address 分支的 IN 参数（与 from 相同的地址列表）
    args.extend(in_args.iter().take(n).cloned());
    if let Some(sym) = sym_arg {
        // from 分支的 token_symbol
        args.push(rbs::value!(sym));
        // to 分支的 token_symbol
        args.push(rbs::value!(sym));
    }
    args.push(rbs::value!(l));
    args.push(rbs::value!(offset));

    #[derive(serde::Deserialize)]
    struct TxWithCount {
        #[serde(flatten)]
        tx: crate::models::Transaction,
        total_count: Option<i64>,
    }
    let rows: Vec<TxWithCount> = query(&rb, &sql, args).await?;
    let total = rows.first().and_then(|r| r.total_count).unwrap_or(0) as u64;
    let transactions: Vec<crate::models::Transaction> = rows.into_iter().map(|r| r.tx).collect();

    Ok((transactions, total))
}

pub async fn get_transaction(
    rb: Arc<RBatis>,
    tx_id: &str,
) -> Result<Option<crate::models::Transaction>, AppError> {
    crate::db::query::query_one(
        &rb,
        "SELECT * FROM transactions WHERE id = $1",
        vals![tx_id],
    )
    .await
    .map_err(AppError::from)
}
