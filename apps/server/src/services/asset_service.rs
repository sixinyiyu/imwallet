//! 资产服务 — 迁移自 IMWallet services/assetService.ts

use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::Asset;
use rbatis::RBatis;
use rust_decimal::Decimal;
use serde::Serialize;
use std::sync::Arc;

pub async fn get_active_assets(rb: Arc<RBatis>) -> Result<Vec<Asset>, AppError> {
    query(
        &rb,
        "SELECT * FROM assets WHERE is_active = true ORDER BY chain, symbol",
        vals![],
    )
    .await
    .map_err(AppError::from)
}

#[derive(Debug, Serialize)]
pub struct AssetBalanceDetail {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub chain: String,
    pub balance: Decimal,
    pub usd_value: Decimal,
    pub cny_value: Decimal,
    pub is_tradable: bool,
}

pub async fn get_wallet_asset_list(
    rb: Arc<RBatis>,
    wallet_id: &str,
    cny_rate: Decimal,
) -> Result<Vec<AssetBalanceDetail>, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        id: String,
        symbol: String,
        name: String,
        chain: String,
        balance: Decimal,
        is_tradable: bool,
    }
    let rows: Vec<R> = query(&rb, "SELECT a.id, a.symbol, a.name, aa.chain, SUM(aa.balance) as balance, a.is_tradable FROM assets_addresses aa JOIN assets a ON a.id = aa.asset_id JOIN wallet_subscriptions ws ON ws.address_id = aa.address_id WHERE ws.wallet_id = $1 AND ws.address_id != '' GROUP BY a.id, a.symbol, a.name, aa.chain, a.is_tradable", vals![wallet_id]).await?;
    Ok(rows
        .into_iter()
        .map(|r| AssetBalanceDetail {
            usd_value: r.balance,
            cny_value: r.balance * cny_rate,
            id: r.id,
            symbol: r.symbol,
            name: r.name,
            chain: r.chain,
            balance: r.balance,
            is_tradable: r.is_tradable,
        })
        .collect())
}

pub async fn toggle_tradable(
    rb: Arc<RBatis>,
    asset_id: &str,
    is_tradable: bool,
) -> Result<Asset, AppError> {
    query_one(
        &rb,
        "UPDATE assets SET is_tradable = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        vals![is_tradable, asset_id],
    )
    .await?
    .ok_or_else(|| AppError::NotFound("资产不存在".into()))
}
