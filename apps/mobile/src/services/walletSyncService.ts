import { walletService, type BatchSyncWalletInput } from "./walletService";
import { localWalletService } from "./localWalletService";
import { localAccountService } from "./localAccountService";
import { localAddressService } from "./localAddressService";
import type { Account } from "../types";
import { perfProbe } from "../utils/perfProbe";

/**
 * 钱包同步服务 — 从 walletStore 中抽离的同步逻辑。
 * 负责：
 *   1. 启动时批量同步本地钱包到服务端（一次请求替代 N+M 次串行同步）
 *   2. 异步加载订阅钱包（从后端获取当前设备的钱包列表）
 */

/** 批量同步本地钱包+地址到服务端（幂等，安全在每次启动时调用）
 *  优化：从原来的 N钱包+M地址 = N+M 次串行请求，改为 1 次批量请求。
 *  后端在事务中幂等处理所有钱包和地址的注册/订阅。
 *  返回每个地址的 server_address_id，前端据此更新本地记录。
 */
export async function syncWalletsWithServer(): Promise<void> {
  const trace = await perfProbe.startTrace("批量同步");
  try {
    const localWallets = await localWalletService.getAllWallets();
    if (localWallets.length === 0) { perfProbe.endTrace(trace); return; }

    // 一次性查询所有账户，内存中按 wallet_id 分组（消除 N+1 查询）
    trace.mark("本地数据读取");
    const allAccounts = await localAccountService.getAllAccounts();
    const accountsByWallet = new Map<string, Account[]>();
    for (const acc of allAccounts) {
      const list = accountsByWallet.get(acc.walletId) || [];
      list.push(acc);
      accountsByWallet.set(acc.walletId, list);
    }

    // 构建批量同步请求体
    const syncInputs: BatchSyncWalletInput[] = localWallets
      .filter((w) => w.source !== "SUBSCRIBE") // 只读订阅钱包不需要同步到服务端
      .map((w) => ({
        walletId: w.id,
        source: w.source === "IMPORT" ? "IMPORT" : "CREATE",
        alias: w.name,
        addresses: (accountsByWallet.get(w.id) || []).map((a) => ({
          chain: a.chain,
          address: a.address,
        })),
      }));

    if (syncInputs.length === 0) { perfProbe.endTrace(trace); return; }

    // 一次请求完成所有同步
    const results = await trace.markAsync("POST /wallets/sync", walletService.batchSyncWallets(syncInputs));

    // 更新本地 server_address_id（如果服务端重置导致 ID 变化）
    trace.mark("更新本地ID");
    for (const r of results) {
      for (const a of r.addresses) {
        const localAccount = await localAccountService.getAccountByAddress(a.address);
        if (localAccount && localAccount.serverAddressId !== a.serverAddressId) {
          await localAccountService.updateAccount(localAccount.id, {
            server_address_id: a.serverAddressId,
          });
        }
      }
    }
  } catch {
    // silent — 同步失败不应阻塞应用启动
  }
  perfProbe.endTrace(trace);
}

/** 异步加载订阅钱包 — 从后端获取当前设备的钱包列表，发现本地不存在时以 SUBSCRIBE 写入 */
export async function syncSubscribedWallets(): Promise<void> {
  try {
    // 从后端获取当前设备订阅的所有钱包
    const { wallets: serverWallets } = await walletService.getWallets();
    const localWallets = await localWalletService.getAllWallets();
    const localIds = new Set(localWallets.map((w) => w.id));

    // 找出本地不存在但后端存在的钱包（即订阅钱包）
    const newWallets = serverWallets.filter((w) => !localIds.has(w.id));
    if (newWallets.length === 0) return;

    for (const w of newWallets) {
      try {
        // 写入本地 wallets 表
        await localWalletService.createWallet({
          id: w.id,
          name: w.name || "",
          source: "SUBSCRIBE",
          password_hash: "",
          password_hint: "",
          mnemonic_hash: "",
        });

        // 从后端获取该钱包的地址列表并写入本地
        const { addresses } = await walletService.getWalletAddresses(w.id);
        for (const addr of addresses) {
          const existingAccount = await localAccountService.getAccountByAddress(addr.address);
          if (!existingAccount) {
            const { generateUUID } = await import("../db/database");
            const accountId = generateUUID();
            await localAccountService.createAccount({
              id: accountId,
              wallet_id: w.id,
              chain: addr.chain,
              derivation_path: "",
              address: addr.address,
              extended_pubkey: "",
              account_index: -1,
              name: `${addr.chain} Account`,
              server_address_id: addr.id,
            });

            await localAddressService.upsertAddress({
              chain: addr.chain,
              address: addr.address,
              walletId: w.id,
              name: `${addr.chain} Account`,
              type: "internalWallet",
              status: "verified",
            });
          }
        }
      } catch {
        // 单个钱包同步失败，继续下一个
      }
    }
  } catch {
    // silent — 异步同步失败不影响用户
  }
}