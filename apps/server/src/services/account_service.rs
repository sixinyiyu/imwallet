//! 账户服务 — 迁移自 IMWallet services/accountService.ts

use crate::db::query::{query, vals};
use crate::errors::AppError;
use rbatis::RBatis;
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct AvailableChain {
    pub name: String,
    pub display_name: String,
    pub account_enable: bool,
    pub derivation_path: String,
    pub assets: Vec<ChainAsset>,
}
#[derive(Debug, Serialize)]
pub struct ChainAsset {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub decimals: i32,
    pub asset_type: String,
    pub token_id: String,
}

/// 批量获取支持创建账户的链列表及其资产（解决 N+1 查询）
pub async fn get_available_chains(rb: Arc<RBatis>) -> Result<Vec<AvailableChain>, AppError> {
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
/// 使用临时表 + JOIN 方式实现参数化 IN 查询，避免 SQL 拼接
pub async fn get_wallet_networks(
    rb: Arc<RBatis>,
    wallet_ids: &[String],
) -> Result<Vec<WalletNetworkInfo>, AppError> {
    if wallet_ids.is_empty() {
        return Ok(Vec::new());
    }

    // 使用 in_clause 实现参数化 IN 查询，避免 rbdc_pg 将 Vec<String> 序列化为 JSON 导致类型转换失败
    #[derive(serde::Deserialize)]
    struct R {
        wallet_id: String,
        chain: String,
    }
    let (in_ph, in_args) = crate::db::query::in_clause(wallet_ids, 1);
    let rows: Vec<R> = query(
        &rb,
        &format!("SELECT ws.wallet_id, wa.chain FROM wallet_subscriptions ws JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.wallet_id IN {} AND ws.address_id != '' ORDER BY ws.wallet_id, wa.chain", in_ph),
        in_args,
    )
    .await?;

    // 按钱包分组
    let mut result = Vec::new();
    let mut current_id = String::new();
    let mut networks = Vec::new();
    for r in rows {
        if r.wallet_id != current_id {
            if !current_id.is_empty() {
                networks.dedup();
                result.push(WalletNetworkInfo {
                    wallet_id: current_id,
                    networks,
                });
            }
            current_id = r.wallet_id;
            networks = vec![r.chain];
        } else {
            networks.push(r.chain);
        }
    }
    if !current_id.is_empty() {
        networks.dedup();
        result.push(WalletNetworkInfo {
            wallet_id: current_id,
            networks,
        });
    }

    // 补充没有网络的 wallet_id（传入但无地址关联）
    for wid in wallet_ids {
        if !result.iter().any(|w| w.wallet_id == *wid) {
            result.push(WalletNetworkInfo {
                wallet_id: wid.clone(),
                networks: Vec::new(),
            });
        }
    }

    Ok(result)
}
