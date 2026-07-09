//! 账户服务 — 迁移自 IMWallet services/accountService.ts

use crate::db::query::{query, vals};
use crate::errors::AppError;
use arc_swap::ArcSwap;
use rbatis::RBatis;
use serde::Serialize;
use std::sync::{Arc, LazyLock};

#[derive(Debug, Serialize, Clone)]
pub struct AvailableChain {
    pub name: String,
    pub display_name: String,
    pub account_enable: bool,
    pub derivation_path: String,
    pub assets: Vec<ChainAsset>,
}
#[derive(Debug, Serialize, Clone)]
pub struct ChainAsset {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub decimals: i32,
    pub asset_type: String,
    pub token_id: String,
}

/// 可用链列表缓存（ArcSwap 无锁读取）
/// 链配置仅在部署时变更，适合长期缓存
static CHAINS_CACHE: LazyLock<ArcSwap<Vec<AvailableChain>>> =
    LazyLock::new(|| ArcSwap::from_pointee(Vec::new()));
static CHAINS_INIT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 启动时预热缓存 — 主动查 DB 并填充，确保后续业务代码可直接读缓存
pub async fn warmup_chains_cache(rb: Arc<RBatis>) -> Result<(), AppError> {
    get_available_chains_cached(rb).await?; // 内部已填充 CHAINS_CACHE
    log::info!("[预热] chains 缓存已初始化");
    Ok(())
}

/// 使链缓存失效
#[allow(dead_code)]
pub fn invalidate_chains_cache() {
    CHAINS_INIT.store(false, std::sync::atomic::Ordering::Relaxed);
}

/// 从缓存获取可用链列表，未初始化时查 DB 并缓存
pub async fn get_available_chains_cached(rb: Arc<RBatis>) -> Result<Vec<AvailableChain>, AppError> {
    if CHAINS_INIT.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(CHAINS_CACHE.load_full().as_ref().clone());
    }
    let chains = get_available_chains(rb).await?;
    CHAINS_CACHE.store(Arc::new(chains.clone()));
    CHAINS_INIT.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(chains)
}

/// 批量获取支持创建账户的链列表及其资产（解决 N+1 查询）
async fn get_available_chains(rb: Arc<RBatis>) -> Result<Vec<AvailableChain>, AppError> {
    // 一条 JOIN SQL 批量获取链 + 资产
    #[derive(serde::Deserialize)]
    struct R {
        chain_name: String,
        display_name: String,
        account_enable: bool,
        derivation_path: String,
        asset_id: Option<String>,
        symbol: Option<String>,
        asset_name: Option<String>,
        decimals: Option<i32>,
        asset_type: Option<String>,
        token_id: Option<String>,
    }
    let rows: Vec<R> = query(
        &rb,
        "SELECT c.name as chain_name, c.display_name, c.account_enable, c.derivation_path, a.id as asset_id, a.symbol, a.name as asset_name, a.decimals, a.type as asset_type, a.token_id FROM chains c LEFT JOIN assets a ON a.chain = c.name AND a.is_active = true WHERE c.account_enable = true ORDER BY c.name, a.symbol",
        vals![],
    )
    .await?;

    // 按链分组
    let mut result = Vec::new();
    let mut current_name = String::new();
    let mut current_display = String::new();
    let mut current_enable = false;
    let mut current_path = String::new();
    let mut assets = Vec::new();
    for r in rows {
        if r.chain_name != current_name {
            if !current_name.is_empty() {
                result.push(AvailableChain {
                    name: current_name,
                    display_name: current_display,
                    account_enable: current_enable,
                    derivation_path: current_path,
                    assets,
                });
            }
            current_name = r.chain_name;
            current_display = r.display_name;
            current_enable = r.account_enable;
            current_path = r.derivation_path;
            assets = Vec::new();
        }
        if let (Some(id), Some(sym), Some(name), Some(dec), Some(at), Some(tid)) = (
            r.asset_id,
            r.symbol,
            r.asset_name,
            r.decimals,
            r.asset_type,
            r.token_id,
        ) {
            assets.push(ChainAsset {
                id,
                symbol: sym,
                name,
                decimals: dec,
                asset_type: at,
                token_id: tid,
            });
        }
    }
    if !current_name.is_empty() {
        result.push(AvailableChain {
            name: current_name,
            display_name: current_display,
            account_enable: current_enable,
            derivation_path: current_path,
            assets,
        });
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct WalletNetworkInfo {
    pub wallet_id: String,
    pub networks: Vec<String>,
}

/// 批量获取钱包网络列表（解决 N+1 查询）
/// 去掉 JOIN wallets_addresses，直接从 wallet_subscriptions 的 chain 字段获取
/// DISTINCT 在 SQL 层去重，Rust 侧用 HashMap 收集，无需手动分组+dedup
pub async fn get_wallet_networks(
    rb: Arc<RBatis>,
    wallet_ids: &[String],
) -> Result<Vec<WalletNetworkInfo>, AppError> {
    if wallet_ids.is_empty() {
        return Ok(Vec::new());
    }

    #[derive(serde::Deserialize)]
    struct R {
        wallet_id: String,
        chain: String,
    }
    let (in_ph, in_args) = crate::db::query::in_clause(wallet_ids, 1);
    let rows: Vec<R> = query(
        &rb,
        &format!(
            "SELECT DISTINCT ws.wallet_id, ws.chain FROM wallet_subscriptions ws WHERE ws.wallet_id IN {} AND ws.address_id != '' AND ws.chain != '' ORDER BY ws.wallet_id, ws.chain",
            in_ph
        ),
        in_args,
    )
    .await?;

    // 用 HashMap 收集，SQL DISTINCT 已去重，无需 Rust 侧 dedup
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for r in rows {
        map.entry(r.wallet_id).or_default().push(r.chain);
    }

    // 补充没有网络的 wallet_id（传入但无地址关联）
    for wid in wallet_ids {
        if !map.contains_key(wid) {
            map.insert(wid.clone(), Vec::new());
        }
    }

    let result: Vec<WalletNetworkInfo> = wallet_ids
        .iter()
        .filter_map(|wid| {
            map.get(wid).map(|networks| WalletNetworkInfo {
                wallet_id: wid.clone(),
                networks: networks.clone(),
            })
        })
        .collect();

    Ok(result)
}
