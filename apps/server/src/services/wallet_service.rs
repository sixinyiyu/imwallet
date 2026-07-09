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

/// 删除钱包订阅 — 仅删除当前设备对该钱包的订阅记录，不删除 wallets 记录。
/// 钱包是全局资源，多设备可能共享同一钱包，删除订阅不影响其他设备。
pub async fn delete_wallet_subscription(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
) -> Result<(), AppError> {
    crate::db::query::exec(
        &rb,
        "DELETE FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2",
        vals![wallet_id, device_id],
    )
    .await?;
    log::info!("[钱包] 删除订阅 — 钱包={}, 设备={}", wallet_id, device_id);
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
/// assets 数据从内存缓存获取（启动时已预热），不再查 DB。
async fn ensure_asset_balances(
    rb: &Arc<RBatis>,
    _address_id: &str,
    chain: &str,
) -> Result<(), AppError> {
    let asset_map = crate::services::asset_service::get_cached_assets_map();
    let assets: Vec<&crate::models::Asset> = asset_map
        .values()
        .filter(|a| a.chain == chain && a.is_default)
        .collect();

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
        chain: String,
        total_balance: Decimal,
    }
    // CTE: 先查出该钱包的所有地址 ID（DISTINCT 去重，避免多设备订阅导致 JOIN 倍增），
    // 再 JOIN assets_addresses 查余额 — 单条 SQL，减少 DB 往返
    // 不再 JOIN assets 表，资产元数据从内存缓存合并（启动时已预热）
    let rows: Vec<R> = query(
        &rb,
        "WITH wallet_addr_ids AS ( \
            SELECT DISTINCT wa.id \
            FROM wallets_addresses wa \
            JOIN wallet_subscriptions ws ON wa.id = ws.address_id \
            WHERE ws.wallet_id = $1 AND ws.address_id != '' \
        ) \
        SELECT aa.asset_id, aa.chain, SUM(aa.balance) as total_balance \
        FROM assets_addresses aa \
        JOIN wallet_addr_ids wai ON aa.address_id = wai.id \
        GROUP BY aa.asset_id, aa.chain",
        vals![wallet_id],
    )
    .await?;

    // 从内存缓存获取资产元数据（启动时已预热，无需 DB 往返）
    let asset_map = crate::services::asset_service::get_cached_assets_map();
    let cny = cny_rate;
    let assets: Vec<AssetBalanceItem> = rows
        .into_iter()
        .filter_map(|r| {
            let asset = asset_map.get(&r.asset_id);
            asset.map(|a| AssetBalanceItem {
                usd_value: r.total_balance,
                cny_value: r.total_balance * cny,
                asset_id: r.asset_id,
                symbol: a.symbol.clone(),
                name: a.name.clone(),
                chain: r.chain,
                decimals: a.decimals,
                icon_url: a.icon_url.clone(),
                balance: r.total_balance,
            })
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
        // 批量 INSERT ON CONFLICT（幂等，已订阅地址自动跳过）— 单次 DB 往返
        // 每条记录 4 个参数：(wallet_id, device_id, chain, address_id)
        let mut args: Vec<rbs::value::Value> = Vec::new();
        let placeholders: Vec<String> = addresses
            .iter()
            .enumerate()
            .map(|(i, wa)| {
                let base = i * 4 + 1;
                args.push(rbs::value::Value::String(wallet_id.to_string()));
                args.push(rbs::value::Value::String(device_id.to_string()));
                args.push(rbs::value::Value::String(wa.chain.clone()));
                args.push(rbs::value::Value::String(wa.id.clone()));
                format!("(${}, ${}, ${}, ${})", base, base + 1, base + 2, base + 3)
            })
            .collect();
        let sql = format!(
            "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES {} ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
            placeholders.join(", ")
        );
        crate::db::query::exec(&rb, &sql, args).await?;
    }

    log::info!(
        "[订阅] 成功 — 钱包={}, 设备={}, 地址数={}",
        wallet_id,
        device_id,
        addresses.len()
    );
    Ok((wallet, addresses))
}

/// 取消只读订阅 — 仅删除当前设备对该钱包的订阅记录，不删除钱包本身。
/// 幂等操作：重复调用不会报错。
pub async fn unsubscribe_wallet_readonly(
    rb: Arc<RBatis>,
    wallet_id: &str,
    device_id: &str,
) -> Result<(), AppError> {
    crate::db::query::exec(
        &rb,
        "DELETE FROM wallet_subscriptions WHERE wallet_id = $1 AND device_id = $2",
        vals![wallet_id, device_id],
    )
    .await?;

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

    // 预加载活跃资产缓存（触发一次 DB 查询或命中内存缓存），
    // 事务内按 chain 内存过滤，避免每个新地址都查 DB
    let all_assets = crate::services::asset_service::get_active_assets(rb.clone()).await?;

    let tx = rb.acquire_begin().await?;
    let mut results = Vec::new();
    // 收集所有订阅记录，最后批量 INSERT（减少事务持有时间）
    let mut subscriptions: Vec<(String, String, String, String)> = Vec::new(); // (wallet_id, device_id, chain, address_id)

    for w in &wallets {
        // 1. 确保钱包存在（幂等）— 一条 SQL 完成创建/更新 alias
        let src = if w.source == "IMPORT" {
            "IMPORT"
        } else {
            "CREATE"
        };
        let _wallet: Wallet = crate::db::query::tx_query_one(
            &tx,
            "INSERT INTO wallets (id, alias, source) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET alias = EXCLUDED.alias RETURNING *",
            vals![&w.wallet_id, &w.alias, src],
        )
        .await?
        .ok_or_else(|| AppError::Internal("钱包同步失败".into()))?;

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

            // 4. 确保地址存在（幂等）— 一条 SQL 完成创建/获取，dummy update 确保 RETURNING * 始终返回记录
            let addr_id = uuid::Uuid::new_v4().to_string();
            let wa: WalletAddress = crate::db::query::tx_query_one(
                &tx,
                "INSERT INTO wallets_addresses (id, chain, address) VALUES ($1, $2, $3) ON CONFLICT (chain, address) DO UPDATE SET chain = EXCLUDED.chain RETURNING *",
                vals![&addr_id, &a.chain, &a.address],
            )
            .await?
            .ok_or_else(|| AppError::Internal("地址同步失败".into()))?;

            // 新地址：初始化该链的默认代币余额（从缓存获取 assets）
            let assets: Vec<&crate::models::Asset> = all_assets
                .iter()
                .filter(|x| x.chain == wa.chain && x.is_default)
                .collect();
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
                        args.push(rbs::value::Value::String(wa.chain.clone()));
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

            // 5. 收集订阅记录（不再逐条 INSERT，最后批量插入）
            subscriptions.push((
                w.wallet_id.clone(),
                device_id.to_string(),
                a.chain.clone(),
                wa.id.clone(),
            ));

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

    // 6. 批量插入所有订阅记录（单次 DB 往返，ON CONFLICT 保证幂等）
    if !subscriptions.is_empty() {
        let mut args: Vec<rbs::value::Value> = Vec::new();
        let placeholders: Vec<String> = subscriptions
            .iter()
            .enumerate()
            .map(|(i, (wid, did, chain, addr_id))| {
                let base = i * 4 + 1;
                args.push(rbs::value::Value::String(wid.clone()));
                args.push(rbs::value::Value::String(did.clone()));
                args.push(rbs::value::Value::String(chain.clone()));
                args.push(rbs::value::Value::String(addr_id.clone()));
                format!("(${}, ${}, ${}, ${})", base, base + 1, base + 2, base + 3)
            })
            .collect();
        let sql = format!(
            "INSERT INTO wallet_subscriptions (wallet_id, device_id, chain, address_id) VALUES {} ON CONFLICT (wallet_id, device_id, chain, address_id) DO NOTHING",
            placeholders.join(", ")
        );
        crate::db::query::tx_exec(&tx, &sql, args).await?;
    }

    tx.commit().await?;
    log::info!(
        "[批量同步] 完成 — 设备={}, 钱包数={}, 总地址数={}, 总订阅数={}",
        device_id,
        wallets.len(),
        results.iter().map(|r| r.addresses.len()).sum::<usize>(),
        subscriptions.len()
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
        #[derive(serde::Deserialize)]
        struct WalletWithCount {
            #[serde(flatten)]
            wallet: Wallet,
            total_count: Option<i64>,
        }
        let rows_with_count: Vec<WalletWithCount> = query(
            &rb,
            "SELECT w.*, COUNT(*) OVER() as total_count FROM wallets w WHERE w.alias ILIKE $1 ORDER BY w.created_at DESC LIMIT $2 OFFSET $3",
            vals![&p, l, o],
        )
        .await?;
        let total = rows_with_count
            .first()
            .and_then(|r| r.total_count)
            .unwrap_or(0) as u64;
        let rows: Vec<Wallet> = rows_with_count.into_iter().map(|r| r.wallet).collect();
        (rows, total)
    } else {
        #[derive(serde::Deserialize)]
        struct WalletWithCount {
            #[serde(flatten)]
            wallet: Wallet,
            total_count: Option<i64>,
        }
        let rows_with_count: Vec<WalletWithCount> = query(
            &rb,
            "SELECT w.*, COUNT(*) OVER() as total_count FROM wallets w ORDER BY w.created_at DESC LIMIT $1 OFFSET $2",
            vals![l, o],
        )
        .await?;
        let total = rows_with_count
            .first()
            .and_then(|r| r.total_count)
            .unwrap_or(0) as u64;
        let rows: Vec<Wallet> = rows_with_count.into_iter().map(|r| r.wallet).collect();
        (rows, total)
    };
    Ok((rows, total))
}
/// 清理孤儿钱包 — 删除没有任何订阅记录且超过指定天数未活跃的钱包。
/// 由定时任务每月调用一次，阈值天数从 app_configs 表读取（key = orphan_wallet_cleanup_days）。
pub async fn cleanup_orphan_wallets(rb: Arc<RBatis>) -> Result<u64, AppError> {
    // 从 app_configs 读取清理阈值天数，默认 180 天
    let days: i64 = crate::db::query::query_one::<crate::models::AppConfigEntity>(
        &rb,
        "SELECT * FROM app_configs WHERE key = $1",
        vals!["orphan_wallet_cleanup_days"],
    )
    .await?
    .and_then(|c| c.value.parse::<i64>().ok())
    .unwrap_or(180);

    // 找出没有任何订阅记录的孤儿钱包，且超过阈值天数未活跃（updated_at）
    #[derive(serde::Deserialize)]
    struct OrphanWallet {
        id: String,
        alias: String,
    }
    let orphans: Vec<OrphanWallet> = query(
        &rb,
        "SELECT w.id, w.alias FROM wallets w \
        WHERE NOT EXISTS (SELECT 1 FROM wallet_subscriptions ws WHERE ws.wallet_id = w.id AND ws.address_id != '') \
        AND w.updated_at < NOW() - ($1 || ' days')::interval \
        ORDER BY w.updated_at ASC",
        vals![days.to_string()],
    )
    .await?;

    if orphans.is_empty() {
        log::info!("[孤儿清理] 无需清理 — 阈值={}天", days);
        return Ok(0);
    }

    // 批量删除孤儿钱包（wallets 表，无 FK 依赖的订阅记录已不存在）
    let ids: Vec<String> = orphans.iter().map(|o| o.id.clone()).collect();
    let (in_ph, in_args) = crate::db::query::in_clause(&ids, 1);
    let result = exec(
        &rb,
        &format!("DELETE FROM wallets WHERE id IN {}", in_ph),
        in_args,
    )
    .await?;

    log::info!(
        "[孤儿清理] 完成 — 阈值={}天, 清理={}个钱包: {}",
        days,
        result.rows_affected,
        orphans
            .iter()
            .map(|o| format!("{}({})", o.alias, o.id))
            .collect::<Vec<_>>()
            .join(", ")
    );
    Ok(result.rows_affected as u64)
}
