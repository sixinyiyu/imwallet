//! 交易服务（转账核心）
//! 迁移自 IMWallet services/transactionService.ts (473行)

use crate::chain::address_validator;
use crate::config::{FeeMode, RuntimeConfig};
use crate::db::query::vals;
use crate::db::query::{tx_exec, tx_query};
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
    // 校验收款地址格式与链类型匹配
    let v = address_validator::validate_address_for_chain(&input.to_address, &input.network);
    if !v.is_valid {
        return Err(AppError::BadRequest(
            v.error.unwrap_or_else(|| "收款地址格式无效".into()),
        ));
    }

    let tx = rb.acquire_begin().await?;

    // ── 合并查询 1+2+3：from_addr + asset + balance 三表 JOIN ──
    // 单次 DB 往返替代原来的 3 次串行查询
    #[derive(serde::Deserialize)]
    struct FromInfo {
        address_id: String,
        from_address: String,
        asset_id: String,
        balance: Decimal,
    }
    let from_info: Vec<FromInfo> = tx_query(
        &tx,
        "SELECT wa.id as address_id, wa.address as from_address, a.id as asset_id, aa.balance \
         FROM wallet_subscriptions ws \
         JOIN wallets_addresses wa ON wa.id = ws.address_id \
         JOIN assets a ON a.symbol = $2 AND a.chain = $3 \
         JOIN assets_addresses aa ON aa.address_id = wa.id AND aa.asset_id = a.id \
         WHERE ws.wallet_id = $1 AND ws.device_id = $4 AND wa.chain = $3 AND ws.address_id != '' \
         LIMIT 1",
        vals![&input.from_wallet_id, &input.token_symbol, &input.network, device_id],
    )
    .await?;
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

    // ── 合并查询 4+5：to_addr + restrict_check ──
    // 如果 tx_restrict_wallet 开启，一条 SQL 同时查 to_addr 和是否存在
    #[derive(serde::Deserialize)]
    struct ToInfo {
        id: String,
    }
    let to_addr: Vec<ToInfo> = tx_query(
        &tx,
        "SELECT id FROM wallets_addresses WHERE address = $1 LIMIT 1",
        vals![&input.to_address],
    )
    .await?;

    // tx_restrict_wallet 检查：to_addr 查询已包含地址是否存在的信息
    if cfg.tx_restrict_wallet && to_addr.is_empty() {
        return Err(AppError::BadRequest("收款地址不在系统内".into()));
    }

    // ── 执行余额变更 ──
    // 扣款
    tx_exec(&tx, "UPDATE assets_addresses SET balance = balance - $1, updated_at = NOW() WHERE address_id = $2 AND asset_id = $3", vals![rbdc::Decimal::new(&total_debit.to_string()).unwrap(), &from.address_id, &from.asset_id]).await?;

    // 加款：使用 INSERT ON CONFLICT DO UPDATE 替代先 COUNT 再 INSERT/UPDATE（1次往返替代2次）
    if let Some(to) = to_addr.first() {
        tx_exec(
            &tx,
            "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) \
             ON CONFLICT (address_id, asset_id) DO UPDATE SET balance = assets_addresses.balance + $5, updated_at = NOW()",
            vals![uuid::Uuid::new_v4().to_string(), &to.id, &from.asset_id, &input.network, rbdc::Decimal::new(&received.to_string()).unwrap()],
        )
        .await?;
    }

    // ── 插入交易记录 ──
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
    tx_exec(&tx, "INSERT INTO transactions (id, tx_hash, from_address, to_address, token_symbol, amount, fee, status, memo, platform, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', $8, $9, NOW(), NOW())", vals![&tx_id, &tx_hash, &from.from_address, &input.to_address, &input.token_symbol, rbdc::Decimal::new(&input.amount.to_string()).unwrap(), rbdc::Decimal::new(&fee.to_string()).unwrap(), input.memo.as_deref().unwrap_or(""), platform]).await?;

    // ── 批量插入通知 ──
    // 1. 转出通知（发送方钱包）
    // 2. 收到转账通知（接收方钱包的所有订阅者）
    let amount_display = input.amount.round_dp(6);
    let received_display = received.round_dp(6);

    // 先查询接收方钱包的订阅者（用于收款通知）
    #[derive(serde::Deserialize)]
    struct W {
        wallet_id: String,
    }
    let to_wallets: Vec<W> = if let Some(to) = to_addr.first() {
        tx_query(
            &tx,
            "SELECT DISTINCT wallet_id FROM wallet_subscriptions WHERE address_id = $1",
            vals![&to.id],
        )
        .await?
    } else {
        Vec::new()
    };

    // 构建所有通知的批量 INSERT（1次 DB 往返替代 N 次）
    let out_meta = serde_json::json!({
        "transaction_id": tx_id,
        "token_symbol": input.token_symbol,
        "chain": input.network,
        "amount": amount_display.to_string()
    });
    let in_meta = serde_json::json!({
        "transaction_id": tx_id,
        "token_symbol": input.token_symbol,
        "chain": input.network,
        "amount": received_display.to_string()
    });
    let out_meta_str = serde_json::to_string(&out_meta).unwrap_or_default();
    let in_meta_str = serde_json::to_string(&in_meta).unwrap_or_default();
    let out_content = format!("转出 {} {}", amount_display, input.token_symbol);
    let in_content = format!("收到 {} {}", received_display, input.token_symbol);

    // 总通知数 = 1（转出） + to_wallets.len()（收款）
    let total_notifs = 1 + to_wallets.len();
    let mut notif_args: Vec<rbs::value::Value> = Vec::new();
    let placeholders: Vec<String> = (0..total_notifs)
        .enumerate()
        .map(|(i, _)| {
            let base = i * 7 + 1;
            // 每条通知: (id, wallet_id, title, content, type, metadata, created_at)
            // id 和 created_at 由参数提供
            format!("(${}, ${}, ${}, ${}, ${}, ${}, NOW())", base, base + 1, base + 2, base + 3, base + 4, base + 5)
        })
        .collect();

    // 转出通知
    notif_args.push(rbs::value::Value::String(uuid::Uuid::new_v4().to_string()));
    notif_args.push(rbs::value::Value::String(input.from_wallet_id.clone()));
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
    tx_exec(&tx, &notif_sql, notif_args).await?;

    tx.commit().await?;

    log::info!(
        "[转账] 完成 — 交易ID={}, 发送方(地址{}) -- {}({}) --> 接收方(地址{}), 转账金额 {} {}, 手续费 {}, 实到 {}, 手续费模式{}, 转账结果：已确认, 交易哈希{}",
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
        &tx_hash
    );

    Ok(TransferResult {
        id: tx_id,
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

pub async fn check_address(rb: Arc<RBatis>, address: &str) -> Result<bool, AppError> {
    let cnt = crate::db::query::query_count(
        &rb,
        "SELECT COUNT(*) as cnt FROM wallets_addresses WHERE address = $1",
        vals![address],
    )
    .await?;
    Ok(cnt > 0)
}
pub async fn get_transactions(
    rb: Arc<RBatis>,
    wallet_id: &str,
    token_symbol: Option<&str>,
    page: u64,
    limit: u64,
) -> Result<(Vec<crate::models::Transaction>, u64), AppError> {
    let o = ((page - 1) * limit) as i64;
    let l = limit as i64;
    use crate::db::query::query;

    // CTE: 预计算钱包地址集合（只执行一次），UNION ALL 让两条分支各自走索引
    // from_address IN (...) 走 from_address 索引，to_address IN (...) 走 to_address 索引
    // NOT IN 排除已作为发送方出现的记录，避免重复
    let cte_prefix = "WITH wallet_addr AS ( \
        SELECT DISTINCT wa.address \
        FROM wallet_subscriptions ws \
        JOIN wallets_addresses wa ON wa.id = ws.address_id \
        WHERE ws.wallet_id = $1 AND ws.address_id != '' \
    ), \
    matched_tx AS ( \
        SELECT t.*, COUNT(*) OVER() as total_count \
        FROM transactions t \
        WHERE t.from_address IN (SELECT address FROM wallet_addr) \
           OR t.to_address   IN (SELECT address FROM wallet_addr) \
        ORDER BY t.created_at DESC \
        LIMIT $2 OFFSET $3 \
    ) \
    SELECT * FROM matched_tx";

    let (rows, total) = if let Some(sym) = token_symbol {
        // CTE + token_symbol 过滤：$1=wallet_id, $2=symbol, $3=limit, $4=offset
        let sql_with_sym = "WITH wallet_addr AS ( \
            SELECT DISTINCT wa.address \
            FROM wallet_subscriptions ws \
            JOIN wallets_addresses wa ON wa.id = ws.address_id \
            WHERE ws.wallet_id = $1 AND ws.address_id != '' \
        ), \
        matched_tx AS ( \
            SELECT t.*, COUNT(*) OVER() as total_count \
            FROM transactions t \
            WHERE (t.from_address IN (SELECT address FROM wallet_addr) \
               OR t.to_address   IN (SELECT address FROM wallet_addr)) \
              AND t.token_symbol = $2 \
            ORDER BY t.created_at DESC \
            LIMIT $3 OFFSET $4 \
        ) \
        SELECT * FROM matched_tx";

        #[derive(serde::Deserialize)]
        struct TxWithCount {
            #[serde(flatten)]
            tx: crate::models::Transaction,
            total_count: Option<i64>,
        }
        let rows_with_count: Vec<TxWithCount> =
            query(&rb, sql_with_sym, vals![wallet_id, sym, l, o]).await?;
        let total = rows_with_count
            .first()
            .and_then(|r| r.total_count)
            .unwrap_or(0) as u64;
        let rows: Vec<crate::models::Transaction> =
            rows_with_count.into_iter().map(|r| r.tx).collect();
        (rows, total)
    } else {
        #[derive(serde::Deserialize)]
        struct TxWithCount {
            #[serde(flatten)]
            tx: crate::models::Transaction,
            total_count: Option<i64>,
        }
        let rows_with_count: Vec<TxWithCount> =
            query(&rb, cte_prefix, vals![wallet_id, l, o]).await?;
        let total = rows_with_count
            .first()
            .and_then(|r| r.total_count)
            .unwrap_or(0) as u64;
        let rows: Vec<crate::models::Transaction> =
            rows_with_count.into_iter().map(|r| r.tx).collect();
        (rows, total)
    };

    Ok((rows, total))
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