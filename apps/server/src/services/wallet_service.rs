//! 钱包服务
//! 迁移自 IMWallet services/walletService.ts

use crate::chain::address_validator;
use crate::db::query::{exec, query, query_one, vals};
use crate::errors::AppError;
use crate::models::{Wallet, WalletAddress};
use rbatis::RBatis;
use rust_decimal::Decimal;
use serde::Serialize;
use std::sync::Arc;

/// 创建钱包并自动订阅 — 事务保护，避免中间失败导致数据不一致
pub async fn create_wallet_and_subscribe(
    rb: Arc<RBatis>,
    wallet_id: &str,
    source: &str,
    alias: &str,
    device_id: &str,
) -> Result<Wallet, AppError> {
    let src = if source == "IMPORT" {
        "IMPORT"
    } else {
        "CREATE"
    };
    let tx = rb.acquire_begin().await?;

    // 1. 创建钱包
    let inserted: Option<Wallet> = crate::db::query::tx_query_one(
        &tx,
        "INSERT INTO wallets (id, alias, source) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING *",
        vals![wallet_id, alias, src],
    )
    .await?;
    let wallet = if let Some(w) = inserted {
        w
    } else {
        // ON CONFLICT 触发，钱包已存在
        crate::db::query::tx_query_one(&tx, "SELECT * FROM wallets WHERE id = $1", vals![wallet_id])
            .await?
            .ok_or_else(|| AppError::Conflict("钱包已存在".into()))?
    };

    // 2. 创建设备订阅
    crate::db::query::tx_exec(
        &tx,
        "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, '', '') ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
        vals![&wallet.id, device_id, "", ""],
    )
    .await?;

    tx.commit().await?;
    log::info!(
        "[钱包] 创建成功 — ID={}, 别名={}, 来源={}, 设备={}",
        &wallet.id,
        &wallet.alias,
        &wallet.source,
        device_id
    );
    Ok(wallet)
}

pub async fn get_wallet(rb: Arc<RBatis>, wallet_id: &str) -> Result<Option<Wallet>, AppError> {
    query_one(&rb, "SELECT * FROM wallets WHERE id = $1", vals![wallet_id])
        .await
        .map_err(AppError::from)
}

/// 获取钱包详情 + 余额聚合（并行查询，减少总耗时）
pub async fn get_wallet_with_balance(
    rb: Arc<RBatis>,
    wallet_id: &str,
    cny_rate: Decimal,
) -> Result<Option<(Wallet, WalletBalance)>, AppError> {
    let (wallet, balance) = tokio::join!(
        get_wallet(rb.clone(), wallet_id),
        get_wallet_balance(rb, wallet_id, cny_rate),
    );
    let wallet = wallet?;
    let balance = balance?;
    match wallet {
        Some(w) => Ok(Some((w, balance))),
        None => Ok(None),
    }
}

/// 删除钱包（事务内同时删除订阅和钱包，保证原子性）
pub async fn delete_wallet_with_subs(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
) -> Result<(), AppError> {
    let tx = rb.acquire_begin().await?;
    crate::db::query::tx_exec(
        &tx,
        "DELETE FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2",
        vals![wallet_id, device_id],
    )
    .await?;
    crate::db::query::tx_exec(&tx, "DELETE FROM wallets WHERE id = $1", vals![wallet_id]).await?;
    tx.commit().await?;
    Ok(())
}

/// 订阅链 — 创建/获取链上地址，并建立设备订阅。
/// 新地址自动初始化该链默认代币余额（balance=0）；
/// 已存在地址若缺少 assets_addresses 记录也会补初始化。
pub async fn subscribe_chain(
    rb: Arc<RBatis>,
    chain: &str,
    address: &str,
) -> Result<WalletAddress, AppError> {
    let v = address_validator::validate_address_for_chain(address, chain);
    if !v.is_valid {
        return Err(AppError::BadRequest(
            v.error.unwrap_or_else(|| "地址格式无效".into()),
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let inserted: Option<WalletAddress> = query_one(
        &rb,
        "INSERT INTO wallets_addresses (id, chain, address) VALUES ($1, $2, $3) ON CONFLICT (chain, address) DO NOTHING RETURNING *",
        vals![&id, chain, address],
    )
    .await?;

    let wa = if let Some(w) = inserted {
        // 新地址：初始化该链的默认代币余额（balance=0）
        ensure_asset_balances(&rb, &w.id, chain).await?;
        w
    } else {
        // ON CONFLICT 触发，地址已存在，检查是否缺少 assets_addresses 记录
        let existing: WalletAddress = query_one(
            &rb,
            "SELECT * FROM wallets_addresses WHERE chain = $1 AND address = $2",
            vals![chain, address],
        )
        .await?
        .ok_or_else(|| AppError::Internal("地址同步失败".into()))?;
        ensure_asset_balances(&rb, &existing.id, chain).await?;
        existing
    };

    Ok(wa)
}

/// 确保地址在该链的 assets_addresses 中有默认代币余额记录。
/// 已有记录的跳过，只补缺失的（balance=0）。
/// 使用批量 INSERT 代替逐条插入，减少 DB 往返。
async fn ensure_asset_balances(
    rb: &Arc<RBatis>,
    _address_id: &str,
    chain: &str,
) -> Result<(), AppError> {
    let assets: Vec<crate::models::Asset> = query(
        rb,
        "SELECT * FROM assets WHERE chain = $1 AND is_default = true",
        vals![chain],
    )
    .await?;

    if assets.is_empty() {
        return Ok(());
    }

    // 参数化批量 INSERT：每个资产一组 ($N, $N+1, $N+2, $N+3, 0) 占位符
    let mut args: Vec<rbs::value::Value> = Vec::new();
    let placeholders: Vec<String> = assets
        .iter()
        .enumerate()
        .map(|(i, a)| {
            let base = i * 4 + 1;
            args.push(rbs::value::Value::String(uuid::Uuid::new_v4().to_string()));
            args.push(rbs::value::Value::String(_address_id.to_string()));
            args.push(rbs::value::Value::String(a.id.clone()));
            args.push(rbs::value::Value::String(chain.to_string()));
            format!(
                "(${}, ${}, ${}, ${}, 0)",
                base,
                base + 1,
                base + 2,
                base + 3
            )
        })
        .collect();
    let sql = format!(
        "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance) VALUES {} ON CONFLICT (address_id, asset_id) DO NOTHING",
        placeholders.join(", ")
    );
    exec(rb, &sql, args).await?;
    Ok(())
}
pub async fn get_wallet_addresses(
    rb: Arc<RBatis>,
    wallet_id: &str,
) -> Result<Vec<WalletAddress>, AppError> {
    query(&rb, "SELECT wa.* FROM wallets_addresses wa JOIN wallet_subscriptions ws ON wa.id = ws.address_id WHERE ws.wallet_id = $1 AND ws.address_id != ''", vals![wallet_id]).await.map_err(AppError::from)
}

pub async fn delete_address(rb: Arc<RBatis>, address_id: &str) -> Result<(), AppError> {
    exec(
        &rb,
        "DELETE FROM wallets_addresses WHERE id = $1",
        vals![address_id],
    )
    .await?;
    Ok(())
}

/// 批量获取设备订阅的钱包列表（解决 N+1 查询）
pub async fn get_wallets_by_device(
    rb: Arc<RBatis>,
    device_id: &str,
) -> Result<Vec<Wallet>, AppError> {
    query(
        &rb,
        "SELECT w.* FROM wallets w JOIN wallet_subscriptions ws ON ws.wallet_id = w.id WHERE ws.device_id = $1 ORDER BY w.created_at DESC",
        vals![device_id],
    )
    .await
    .map_err(AppError::from)
}

/// 批量获取钱包聚合数据（钱包 + 网络）（解决 N+1 查询）
#[derive(Debug, Serialize)]
pub struct WalletAggregate {
    pub wallet_id: String,
    pub alias: Option<String>,
    pub source: Option<String>,
    pub networks: Vec<String>,
}

pub async fn get_wallets_aggregate_by_device(
    rb: Arc<RBatis>,
    device_id: &str,
) -> Result<Vec<WalletAggregate>, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        wallet_id: String,
        alias: Option<String>,
        source: Option<String>,
        chain: String,
    }
    let rows: Vec<R> = query(
        &rb,
        "SELECT ws.wallet_id, w.alias, w.source, wa.chain FROM wallet_subscriptions ws JOIN wallets w ON w.id = ws.wallet_id JOIN wallets_addresses wa ON wa.id = ws.address_id WHERE ws.device_id = $1 AND ws.address_id != '' ORDER BY ws.wallet_id, wa.chain",
        vals![device_id],
    )
    .await?;

    // 按钱包分组
    let mut result = Vec::new();
    let mut current_id = String::new();
    let mut networks = Vec::new();
    let mut current_alias: Option<String> = None;
    let mut current_source: Option<String> = None;
    for r in rows {
        if r.wallet_id != current_id {
            if !current_id.is_empty() {
                networks.dedup();
                result.push(WalletAggregate {
                    wallet_id: current_id,
                    alias: current_alias,
                    source: current_source,
                    networks,
                });
            }
            current_id = r.wallet_id;
            current_alias = r.alias;
            current_source = r.source;
            networks = vec![r.chain];
        } else {
            networks.push(r.chain);
        }
    }
    if !current_id.is_empty() {
        networks.dedup();
        result.push(WalletAggregate {
            wallet_id: current_id,
            alias: current_alias,
            source: current_source,
            networks,
        });
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct WalletBalance {
    pub total_balance_usd: Decimal,
    pub total_balance_cny: Decimal,
    pub assets: Vec<AssetBalanceItem>,
}
#[derive(Debug, Serialize)]
pub struct AssetBalanceItem {
    pub asset_id: String,
    pub symbol: String,
    pub name: String,
    pub chain: String,
    pub decimals: i32,
    pub icon_url: String,
    pub balance: Decimal,
    pub usd_value: Decimal,
    pub cny_value: Decimal,
}

pub async fn get_wallet_balance(
    rb: Arc<RBatis>,
    wallet_id: &str,
    cny_rate: Decimal,
) -> Result<WalletBalance, AppError> {
    #[derive(serde::Deserialize)]
    struct R {
        asset_id: String,
        symbol: String,
        name: String,
        chain: String,
        decimals: i32,
        icon_url: String,
        total_balance: Decimal,
    }
    let rows: Vec<R> = query(&rb, "SELECT aa.asset_id, a.symbol, a.name, aa.chain, a.decimals, a.icon_url, SUM(aa.balance) as total_balance FROM assets_addresses aa JOIN assets a ON a.id = aa.asset_id JOIN wallet_subscriptions ws ON ws.address_id = aa.address_id WHERE ws.wallet_id = $1 AND ws.address_id != '' GROUP BY aa.asset_id, a.symbol, a.name, aa.chain, a.decimals, a.icon_url", vals![wallet_id]).await?;
    let cny = cny_rate;
    let assets: Vec<AssetBalanceItem> = rows
        .into_iter()
        .map(|r| AssetBalanceItem {
            usd_value: r.total_balance,
            cny_value: r.total_balance * cny,
            asset_id: r.asset_id,
            symbol: r.symbol,
            name: r.name,
            chain: r.chain,
            decimals: r.decimals,
            icon_url: r.icon_url,
            balance: r.total_balance,
        })
        .collect();
    Ok(WalletBalance {
        total_balance_usd: assets.iter().map(|a| a.usd_value).sum(),
        total_balance_cny: assets.iter().map(|a| a.cny_value).sum(),
        assets,
    })
}

/// 只读订阅钱包 — 当前设备订阅一个已存在的钱包（不含助记词）。
/// 逻辑：
///   1. 查询钱包是否存在
///   2. 检查当前设备是否已订阅该钱包
///   3. 获取该钱包的所有链上地址
///   4. 为每个地址批量插入 wallet_subscriptions 记录
///   5. 返回钱包信息 + 地址列表
pub async fn subscribe_wallet_readonly(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
) -> Result<(Wallet, Vec<WalletAddress>), AppError> {
    // 1. 查询钱包是否存在
    let wallet = get_wallet(rb.clone(), wallet_id)
        .await?
        .ok_or_else(|| AppError::NotFound("钱包不存在".into()))?;

    // 2. 获取该钱包的所有链上地址（跳过 COUNT 检查，INSERT ON CONFLICT 保证幂等）
    let addresses = get_wallet_addresses(rb.clone(), wallet_id).await?;

    // 3. 批量插入订阅记录（单条 SQL，ON CONFLICT 保证幂等）
    if addresses.is_empty() {
        crate::db::query::exec(
            &rb,
            "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, '', '') ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
            vals![wallet_id, device_id, "", ""],
        )
        .await?;
    } else {
        // 逐条 INSERT ON CONFLICT（幂等，已订阅地址自动跳过）
        for wa in &addresses {
            crate::db::query::exec(
                &rb,
                "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, $3, $4) ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
                vals![wallet_id, device_id, &wa.chain, &wa.id],
            )
            .await?;
        }
    }

    log::info!(
        "[订阅] 成功 — 钱包={}, 设备={}, 地址数={}",
        wallet_id,
        device_id,
        addresses.len()
    );
    Ok((wallet, addresses))
}

/// 取消只读订阅 — 仅删除当前设备对该钱包的订阅记录，不删除钱包本身
pub async fn unsubscribe_wallet_readonly(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
) -> Result<(), AppError> {
    // 检查钱包是否存在
    let _wallet = get_wallet(rb.clone(), wallet_id)
        .await?
        .ok_or_else(|| AppError::NotFound("钱包不存在".into()))?;

    crate::services::device_service::unsubscribe_wallet(rb, wallet_id, device_id).await?;

    log::info!("[只读订阅] 取消 — 钱包={}, 设备={}", wallet_id, device_id);
    Ok(())
}

/// 批量同步钱包+地址 — 一次请求完成所有钱包和地址的幂等同步。
/// 前端启动时调用此接口替代逐钱包/逐地址的串行同步。
/// 事务保护：钱包和地址的创建/订阅在同一个事务中完成。
/// 返回每个地址的服务端 ID，前端据此更新本地 `server_address_id`。
#[derive(Debug, serde::Deserialize)]
pub struct SyncWalletInput {
    pub wallet_id: String,
    pub source: String,
    pub alias: String,
    pub addresses: Vec<SyncAddressInput>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SyncAddressInput {
    pub chain: String,
    pub address: String,
}

#[derive(Debug, serde::Serialize)]
pub struct SyncResult {
    pub wallet_id: String,
    pub addresses: Vec<SyncAddressResult>,
}

#[derive(Debug, serde::Serialize)]
pub struct SyncAddressResult {
    pub chain: String,
    pub address: String,
    pub server_address_id: String,
}

pub async fn batch_sync_wallets(
    rb: Arc<RBatis>,
    device_id: &str,
    wallets: Vec<SyncWalletInput>,
) -> Result<Vec<SyncResult>, AppError> {
    if wallets.is_empty() {
        return Ok(Vec::new());
    }

    let tx = rb.acquire_begin().await?;
    let mut results = Vec::new();

    for w in &wallets {
        // 1. 确保钱包存在（幂等）
        let src = if w.source == "IMPORT" {
            "IMPORT"
        } else {
            "CREATE"
        };
        let inserted: Option<Wallet> = crate::db::query::tx_query_one(
            &tx,
            "INSERT INTO wallets (id, alias, source) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING *",
            vals![&w.wallet_id, &w.alias, src],
        )
        .await?;
        // 钱包已存在时也确保别名可更新（前端可能修改了别名）
        if inserted.is_none() {
            crate::db::query::tx_exec(
                &tx,
                "UPDATE wallets SET alias = $1 WHERE id = $2 AND alias != $1",
                vals![&w.alias, &w.wallet_id],
            )
            .await?;
        }

        // 2. 确保设备有空订阅占位（与 create_wallet_and_subscribe 一致）
        crate::db::query::tx_exec(
            &tx,
            "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, '', '') ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
            vals![&w.wallet_id, device_id, "", ""],
        )
        .await?;

        let mut address_results = Vec::new();

        for a in &w.addresses {
            // 3. 地址验证
            let v = address_validator::validate_address_for_chain(&a.address, &a.chain);
            if !v.is_valid {
                log::warn!(
                    "[批量同步] 地址验证失败 — 链={}, 地址前8={}, 错误={}",
                    &a.chain,
                    &a.address[..8.min(a.address.len())],
                    v.error.unwrap_or_default()
                );
                continue; // 跳过无效地址，不中断整个同步
            }

            // 4. 确保地址存在（幂等）
            let addr_id = uuid::Uuid::new_v4().to_string();
            let inserted_addr: Option<WalletAddress> = crate::db::query::tx_query_one(
                &tx,
                "INSERT INTO wallets_addresses (id, chain, address) VALUES ($1, $2, $3) ON CONFLICT (chain, address) DO NOTHING RETURNING *",
                vals![&addr_id, &a.chain, &a.address],
            )
            .await?;

            let wa = if let Some(wa) = inserted_addr {
                // 新地址：初始化该链的默认代币余额
                // 注意：ensure_asset_balances 需要非事务连接，这里在事务内用 tx_query
                let assets: Vec<crate::models::Asset> = crate::db::query::tx_query(
                    &tx,
                    "SELECT * FROM assets WHERE chain = $1 AND is_default = true",
                    vals![&a.chain],
                )
                .await?;
                if !assets.is_empty() {
                    let mut args: Vec<rbs::value::Value> = Vec::new();
                    let placeholders: Vec<String> = assets
                        .iter()
                        .enumerate()
                        .map(|(i, asset)| {
                            let base = i * 4 + 1;
                            args.push(rbs::value::Value::String(uuid::Uuid::new_v4().to_string()));
                            args.push(rbs::value::Value::String(wa.id.clone()));
                            args.push(rbs::value::Value::String(asset.id.clone()));
                            args.push(rbs::value::Value::String(a.chain.clone()));
                            format!(
                                "(${}, ${}, ${}, ${}, 0)",
                                base,
                                base + 1,
                                base + 2,
                                base + 3
                            )
                        })
                        .collect();
                    let sql = format!(
                        "INSERT INTO assets_addresses (id, address_id, asset_id, chain, balance) VALUES {} ON CONFLICT (address_id, asset_id) DO NOTHING",
                        placeholders.join(", ")
                    );
                    crate::db::query::tx_exec(&tx, &sql, args).await?;
                }
                wa
            } else {
                // 地址已存在，查询已有记录
                let existing: WalletAddress = crate::db::query::tx_query_one(
                    &tx,
                    "SELECT * FROM wallets_addresses WHERE chain = $1 AND address = $2",
                    vals![&a.chain, &a.address],
                )
                .await?
                .ok_or_else(|| AppError::Internal("地址同步失败".into()))?;
                existing
            };

            // 5. 确保设备订阅该地址（幂等）
            crate::db::query::tx_exec(
                &tx,
                "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES ($1, $2, $3, $4) ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
                vals![&w.wallet_id, device_id, &a.chain, &wa.id],
            )
            .await?;

            address_results.push(SyncAddressResult {
                chain: a.chain.clone(),
                address: a.address.clone(),
                server_address_id: wa.id,
            });
        }

        results.push(SyncResult {
            wallet_id: w.wallet_id.clone(),
            addresses: address_results,
        });
    }

    tx.commit().await?;
    log::info!(
        "[批量同步] 完成 — 设备={}, 钱包数={}, 总地址数={}",
        device_id,
        wallets.len(),
        results.iter().map(|r| r.addresses.len()).sum::<usize>()
    );
    Ok(results)
}

pub async fn get_all_wallets(
    rb: Arc<RBatis>,
    search: Option<&str>,
    page: u64,
    limit: u64,
) -> Result<(Vec<Wallet>, u64), AppError> {
    let o = ((page - 1) * limit) as i64;
    let l = limit as i64;
    let (rows, total) = if let Some(kw) = search {
        let p = format!("%{}%", kw.replace('%', "\\%").replace('_', "\\_"));
        let total = crate::db::query::query_count(
            &rb,
            "SELECT COUNT(*) as cnt FROM wallets WHERE alias ILIKE $1",
            vals![&p],
        )
        .await?;
        let rows: Vec<Wallet> = query(&rb, "SELECT * FROM wallets WHERE alias ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", vals![&p, l, o]).await?;
        (rows, total)
    } else {
        let total =
            crate::db::query::query_count(&rb, "SELECT COUNT(*) as cnt FROM wallets", vals![])
                .await?;
        let rows: Vec<Wallet> = query(
            &rb,
            "SELECT * FROM wallets ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            vals![l, o],
        )
        .await?;
        (rows, total)
    };
    Ok((rows, total))
}
