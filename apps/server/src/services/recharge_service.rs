//! 充值服务 — 迁移自 IMWallet services/rechargeService.ts

use crate::chain::address_validator;
use crate::db::query::{tx_exec, tx_query, tx_query_count, vals};
use crate::errors::AppError;
use crate::models::{AppConfigEntity, Asset};
use rbatis::RBatis;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::utils::short_addr;

#[derive(Debug, Deserialize)]
pub struct RechargeInput {
    pub wallet_id: String,
    pub wallet_alias: String,
    pub token_symbol: String,
    pub network: String,
    pub account_address: String,
    pub amount: Decimal,
    pub memo: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct RechargeResult {
    pub id: String,
    pub wallet_id: String,
    pub wallet_alias: String,
    pub account_address: String,
    pub token_symbol: String,
    pub amount: Decimal,
}

pub async fn execute_recharge(
    rb: Arc<RBatis>,
    input: RechargeInput,
    device_id: &str,
    platform: &str,
    version: &str,
) -> Result<RechargeResult, AppError> {
    log::info!(
        "[充值] 设备{}从{}端发起充值请求，钱包{}(ID{}), 代币{}({}), 充值金额 {}",
        short_addr(device_id),
        platform,
        &input.wallet_alias,
        &input.wallet_id,
        &input.token_symbol,
        &input.network,
        input.amount
    );

    // 校验充值设备白名单：仅白名单中的设备可充值，白名单为空时拒绝所有设备
    let allowed: Vec<String> = crate::db::query::query_one::<AppConfigEntity>(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["recharge_allowed_devices"],
    )
    .await?
    .and_then(|c| serde_json::from_str::<Vec<String>>(&c.value).ok())
    .unwrap_or_default();
    if allowed.is_empty() || !allowed.iter().any(|d| d == device_id) {
        log::warn!(
            "[充值] 拒绝 — 设备{}不在充值白名单中(白名单为空={})",
            short_addr(device_id),
            allowed.is_empty()
        );
        return Err(AppError::Forbidden("该设备不在充值白名单中".into()));
    }

    // 校验充值地址格式与链类型匹配
    let v = address_validator::validate_address_for_chain(&input.account_address, &input.network);
    if !v.is_valid {
        return Err(AppError::BadRequest(
            v.error.unwrap_or_else(|| "充值地址格式无效".into()),
        ));
    }

    // 使用事务保护整个充值操作
    let tx = rb.acquire_begin().await?;

    let assets: Vec<Asset> = tx_query(
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
    struct A {
        id: String,
    }
    let addrs: Vec<A> = tx_query(&tx, "SELECT wa.id FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND wa.chain = $2 AND wa.address = $3 LIMIT 1", vals![&input.wallet_id, &input.network, &input.account_address]).await?;
    let addr = addrs
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound("未找到该链上地址".into()))?;

    let cnt = tx_query_count(
        &tx,
        "SELECT COUNT(*) as cnt FROM assets_addresses WHERE address_id = $1 AND asset_id = $2",
        vals![&addr.id, &asset.id],
    )
    .await?;
    if cnt > 0 {
        tx_exec(&tx, "UPDATE assets_addresses SET balance = balance + $1, updated_at = NOW() WHERE address_id = $2 AND asset_id = $3", vals![rbdc::Decimal::new(&input.amount.to_string()).unwrap(), &addr.id, &asset.id]).await?;
    } else {
        tx_exec(&tx, "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())", vals![uuid::Uuid::new_v4().to_string(), &addr.id, &asset.id, &input.network, rbdc::Decimal::new(&input.amount.to_string()).unwrap()]).await?;
    }

    let rid = uuid::Uuid::new_v4().to_string();
    tx_exec(&tx, "INSERT INTO recharges (id, wallet_id, wallet_alias, account_address, token_symbol, token_name, amount, memo, device_id, platform, version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())", vals![&rid, &input.wallet_id, &input.wallet_alias, &input.account_address, &input.token_symbol, &asset.name, rbdc::Decimal::new(&input.amount.to_string()).unwrap(), input.memo.as_deref().unwrap_or(""), device_id, platform, version]).await?;

    tx.commit().await?;

    log::info!(
        "[充值] 完成 — 充值ID={}, 钱包{}(ID{}), 代币{}({}), 充值金额 {}, 设备{}",
        &rid,
        &input.wallet_alias,
        &input.wallet_id,
        &input.token_symbol,
        &input.network,
        input.amount,
        short_addr(device_id)
    );

    Ok(RechargeResult {
        id: rid,
        wallet_id: input.wallet_id,
        wallet_alias: input.wallet_alias,
        account_address: input.account_address,
        token_symbol: input.token_symbol,
        amount: input.amount,
    })
}
