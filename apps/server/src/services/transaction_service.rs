//! 交易服务（转账核心）
//! 迁移自 IMWallet services/transactionService.ts (473行)

use crate::chain::address_validator;
use crate::config::{FeeMode, RuntimeConfig};
use crate::db::query::vals;
use crate::db::query::{tx_exec, tx_query, tx_query_count};
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

    let cnt = tx_query_count(
        &tx,
        "SELECT COUNT(*) as cnt FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2",
        vals![&input.from_wallet_id, device_id],
    )
    .await?;
    if cnt == 0 {
        return Err(AppError::Forbidden("该钱包不属于当前设备".into()));
    }

    let assets: Vec<crate::models::Asset> = tx_query(
        &tx,
        "SELECT * FROM assets WHERE symbol = $1 AND chain = $2 LIMIT 1",
        vals![&input.token_symbol, &input.network],
    )
    .await?;
    let asset = assets
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("代币类型不存在".into()))?;

    #[derive(serde::Deserialize)]
    struct Addr {
        id: String,
        address: String,
    }
    let from_addr: Vec<Addr> = tx_query(&tx, "SELECT wa.id, wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND wa.chain = $2 AND ws.address_id != '' LIMIT 1", vals![&input.from_wallet_id, &input.network]).await?;
    let from_addr = from_addr
        .into_iter()
        .next()
        .ok_or_else(|| AppError::BadRequest("未找到发送方地址".into()))?;

    let bals: Vec<crate::models::AssetAddress> = tx_query(
        &tx,
        "SELECT * FROM assets_addresses WHERE address_id = $1 AND asset_id = $2 LIMIT 1",
        vals![&from_addr.id, &asset.id],
    )
    .await?;
    let bal = bals
        .into_iter()
        .next()
        .ok_or_else(|| AppError::BadRequest("当前钱包无该代币余额".into()))?;

    let fee_rate = Decimal::from_f64_retain(cfg.fee_rate).unwrap_or(Decimal::new(5, 3));
    let fee_mode = FeeMode::from_str(&cfg.fee_mode);
    let fee = (input.amount * fee_rate).round_dp(6);
    let (received, total_debit) = match fee_mode {
        FeeMode::Deducted => ((input.amount - fee).round_dp(6), input.amount),
        FeeMode::Extra => (input.amount, (input.amount + fee).round_dp(6)),
    };
    if bal.balance < total_debit {
        return Err(AppError::BadRequest("余额不足".into()));
    }

    if cfg.tx_restrict_wallet {
        let c = tx_query_count(
            &tx,
            "SELECT COUNT(*) as cnt FROM wallets_addresses WHERE address = $1",
            vals![&input.to_address],
        )
        .await?;
        if c == 0 {
            return Err(AppError::BadRequest("收款地址不在系统内".into()));
        }
    }

    let to_addr: Vec<Addr> = tx_query(
        &tx,
        "SELECT id, address FROM wallets_addresses WHERE address = $1 LIMIT 1",
        vals![&input.to_address],
    )
    .await?;

    tx_exec(&tx, "UPDATE assets_addresses SET balance = balance - $1, updated_at = NOW() WHERE address_id = $2 AND asset_id = $3", vals![rbdc::Decimal::new(&total_debit.to_string()).unwrap(), &from_addr.id, &asset.id]).await?;

    if let Some(to) = to_addr.first() {
        let c = tx_query_count(
            &tx,
            "SELECT COUNT(*) as cnt FROM assets_addresses WHERE address_id = $1 AND asset_id = $2",
            vals![&to.id, &asset.id],
        )
        .await?;
        if c > 0 {
            tx_exec(&tx, "UPDATE assets_addresses SET balance = balance + $1, updated_at = NOW() WHERE address_id = $2 AND asset_id = $3", vals![rbdc::Decimal::new(&received.to_string()).unwrap(), &to.id, &asset.id]).await?;
        } else {
            tx_exec(&tx, "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())", vals![uuid::Uuid::new_v4().to_string(), &to.id, &asset.id, &input.network, rbdc::Decimal::new(&received.to_string()).unwrap()]).await?;
        }
    }

    let tx_id = uuid::Uuid::new_v4().to_string();
    let hash = format!(
        "{}{}{}{}{}",
        from_addr.address,
        input.to_address,
        input.amount,
        uuid::Uuid::new_v4(),
        time::OffsetDateTime::now_utc()
    );
    let tx_hash = format!("0x{}", hex::encode(Sha256::digest(hash.as_bytes())));
    tx_exec(&tx, "INSERT INTO transactions (id, tx_hash, from_address, to_address, token_symbol, amount, fee, status, memo, platform, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', $8, $9, NOW(), NOW())", vals![&tx_id, &tx_hash, &from_addr.address, &input.to_address, &input.token_symbol, rbdc::Decimal::new(&input.amount.to_string()).unwrap(), rbdc::Decimal::new(&fee.to_string()).unwrap(), input.memo.as_deref().unwrap_or(""), platform]).await?;

    // 通知内容：金额统一 round_dp(6) 避免精度溢出（如 3.9799999999999999995836663656）
    let amount_display = input.amount.round_dp(6);
    let received_display = received.round_dp(6);

    // 通知 metadata：轻量提示信息，不存地址（详情页已有完整信息）
    let out_meta = serde_json::json!({
        "transaction_id": tx_id,
        "token_symbol": input.token_symbol,
        "chain": input.network,
        "amount": amount_display.to_string()
    });
    let nid1 = uuid::Uuid::new_v4().to_string();
    tx_exec(&tx, "INSERT INTO notifications (id, wallet_id, title, content, type, metadata, created_at) VALUES ($1, $2, '转账成功', $3, $4, $5, NOW())", vals![&nid1, &input.from_wallet_id, &format!("转出 {} {}", amount_display, input.token_symbol), TRANSFER_OUT, &out_meta]).await?;

    if let Some(to) = to_addr.first() {
        #[derive(serde::Deserialize)]
        struct W {
            wallet_id: String,
        }
        let wallets: Vec<W> = tx_query(
            &tx,
            "SELECT wallet_id FROM wallet_subscriptions WHERE address_id = $1",
            vals![&to.id],
        )
        .await?;
        for w in wallets {
            let in_meta = serde_json::json!({
                "transaction_id": tx_id,
                "token_symbol": input.token_symbol,
                "chain": input.network,
                "amount": received_display.to_string()
            });
            let nid2 = uuid::Uuid::new_v4().to_string();
            tx_exec(&tx, "INSERT INTO notifications (id, wallet_id, title, content, type, metadata, created_at) VALUES ($1, $2, '收到转账', $3, $4, $5, NOW())", vals![&nid2, &w.wallet_id, &format!("收到 {} {}", received_display, input.token_symbol), TRANSFER_IN, &in_meta]).await?;
        }
    }

    tx.commit().await?;

    log::info!(
        "[转账] 完成 — 交易ID={}, 发送方(地址{}) -- {}({}) --> 接收方(地址{}), 转账金额 {} {}, 手续费 {}, 实到 {}, 手续费模式{}, 转账结果：已确认, 交易哈希{}",
        &tx_id,
        short_addr(&from_addr.address),
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
        from_address: from_addr.address,
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
    use crate::db::query::{query, query_count};

    // 子查询：当前钱包关联的所有链上地址（去重）
    // 空地址集时 IN 自然匹配不到，无需额外空检查
    // 使用子查询替代 CTE，避免 CTE 在 COUNT 和 SELECT 中重复定义
    let addr_subquery = "SELECT DISTINCT wa.address FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND ws.address_id != ''";
    let where_clause = "(t.from_address IN ({sub}) OR t.to_address IN ({sub}))";

    let (rows, total) = if let Some(sym) = token_symbol {
        let where_sql = where_clause.replace("{sub}", addr_subquery);
        let rows: Vec<crate::models::Transaction> = query(
            &rb,
            &format!("SELECT t.* FROM transactions t WHERE {where_sql} AND t.token_symbol = $2 ORDER BY t.created_at DESC LIMIT $3 OFFSET $4"),
            vals![wallet_id, sym, l, o],
        )
        .await?;
        let total = query_count(
            &rb,
            &format!("SELECT COUNT(*) as cnt FROM transactions t WHERE {where_sql} AND t.token_symbol = $2"),
            vals![wallet_id, sym],
        )
        .await?;
        (rows, total)
    } else {
        let where_sql = where_clause.replace("{sub}", addr_subquery);
        let rows: Vec<crate::models::Transaction> = query(
            &rb,
            &format!("SELECT t.* FROM transactions t WHERE {where_sql} ORDER BY t.created_at DESC LIMIT $2 OFFSET $3"),
            vals![wallet_id, l, o],
        )
        .await?;
        let total = query_count(
            &rb,
            &format!("SELECT COUNT(*) as cnt FROM transactions t WHERE {where_sql}"),
            vals![wallet_id],
        )
        .await?;
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
