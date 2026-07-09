//! 资产服务 — 迁移自 IMWallet services/assetService.ts

use crate::db::query::{query, query_one, vals};
use crate::errors::AppError;
use crate::models::Asset;
use arc_swap::ArcSwap;
use rbatis::RBatis;
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

/// 启动时预热缓存 — 主动查 DB 并填充，确保后续业务代码可直接读缓存
pub async fn warmup_active_assets_cache(rb: Arc<RBatis>) -> Result<(), AppError> {
    get_active_assets(rb).await?; // 内部已填充 ACTIVE_ASSETS_CACHE
    log::info!("[预热] assets 缓存已初始化");
    Ok(())
}

/// 从缓存直接获取资产 HashMap（启动预热后调用，无需 DB 连接）
/// 返回 (asset_id -> Asset) 的映射，用于余额合并等场景
pub fn get_cached_assets_map() -> std::collections::HashMap<String, Asset> {
    if ACTIVE_ASSETS_INIT.load(std::sync::atomic::Ordering::Relaxed) {
        ACTIVE_ASSETS_CACHE
            .load_full()
            .as_ref()
            .iter()
            .map(|a| (a.id.clone(), a.clone()))
            .collect()
    } else {
        // 缓存未初始化（不应该发生，启动时已预热）
        log::warn!("assets 缓存未初始化，返回空 HashMap — 请检查启动预热逻辑");
        std::collections::HashMap::new()
    }
}

/// 使缓存失效（toggle_tradable 等更新操作后调用）
pub fn invalidate_active_assets_cache() {
    ACTIVE_ASSETS_INIT.store(false, std::sync::atomic::Ordering::Relaxed);
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
