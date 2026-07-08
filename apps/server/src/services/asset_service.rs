//! 资产服务 — 迁移自 IMWallet services/assetService.ts

use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::Asset;
use arc_swap::ArcSwap;
use rbatis::RBatis;
use rust_decimal::Decimal;
use serde::Serialize;
use std::sync::{Arc, LazyLock};

/// 活跃资产列表缓存（ArcSwap 无锁读取）
/// 资产数据极少变更（仅在运维添加新代币时变化）
static ACTIVE_ASSETS_CACHE: LazyLock<ArcSwap<Vec<Asset>>> =
    LazyLock::new(|| ArcSwap::from_pointee(Vec::new()));
/// 缓存是否已初始化
static ACTIVE_ASSETS_INIT: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// 从缓存获取活跃资产列表，未初始化时查 DB 并缓存
pub async fn get_active_assets(rb: Arc<RBatis>) -> Result<Vec<Asset>, AppError> {
    if ACTIVE_ASSETS_INIT.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(ACTIVE_ASSETS_CACHE.load_full().as_ref().clone());
    }
    let assets: Vec<Asset> = query(
        &rb,
        "SELECT * FROM assets WHERE is_active = true ORDER BY chain, symbol",
        vals![],
    )
    .await
    .map_err(AppError::from)?;
    ACTIVE_ASSETS_CACHE.store(Arc::new(assets.clone()));
    ACTIVE_ASSETS_INIT.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(assets)
}

/// 使缓存失效（toggle_tradable 等更新操作后调用）
pub fn invalidate_active_assets_cache() {
    ACTIVE_ASSETS_INIT.store(false, std::sync::atomic::Ordering::Relaxed);
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
    // CTE: 先用 DISTINCT 子查询获取地址 ID 集合，避免多设备订阅导致 JOIN 倍增
    // 与 get_wallet_balance 的 CTE 方案一致
    let rows: Vec<R> = query(
        &rb,
        "WITH wallet_addr_ids AS ( \
            SELECT DISTINCT wa.id \
            FROM wallets_addresses wa \
            JOIN wallet_subscriptions ws ON wa.id = ws.address_id \
            WHERE ws.wallet_id = $1 AND ws.address_id != '' \
        ) \
        SELECT a.id, a.symbol, a.name, aa.chain, SUM(aa.balance) as balance, a.is_tradable \
        FROM assets_addresses aa \
        JOIN assets a ON a.id = aa.asset_id \
        JOIN wallet_addr_ids wai ON aa.address_id = wai.id \
        GROUP BY a.id, a.symbol, a.name, aa.chain, a.is_tradable",
        vals![wallet_id],
    ).await?;
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
    let asset: Asset = query_one(
        &rb,
        "UPDATE assets SET is_tradable = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        vals![is_tradable, asset_id],
    )
    .await?
    .ok_or_else(|| AppError::NotFound("资产不存在".into()))?;
    invalidate_active_assets_cache();
    Ok(asset)
}