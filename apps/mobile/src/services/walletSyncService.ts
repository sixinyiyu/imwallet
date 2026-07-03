import { walletService } from "./walletService";
import { localWalletService, hashPassword } from "./localWalletService";
import { localAccountService } from "./localAccountService";
import { localAddressService } from "./localAddressService";
import { syncService } from "./syncService";

/**
 * 钱包同步服务 — 从 walletStore 中抽离的同步逻辑。
 * 负责：
 *   1. 启动时重新同步本地钱包到服务端（恢复服务端数据丢失）
 *   2. 异步加载订阅钱包（从后端获取当前设备的钱包列表）
 */

/** 重新同步所有本地钱包和账户到服务端（幂等，安全在每次启动时调用） */
export async function syncWalletsWithServer(): Promise<void> {
  try {
    const localWallets = await localWalletService.getAllWallets();
    for (const wallet of localWallets) {
      try {
        // 重新注册钱包（幂等：创建如果缺失，更新别名如果存在）
        await syncService.registerWallet(
          wallet.source as "CREATE" | "IMPORT",
          wallet.id,
          wallet.name
        );
      } catch {
        // 钱包可能已存在或网络错误，继续
      }

      // 重新同步所有账户（地址）
      const accounts = await localAccountService.getWalletAccounts(wallet.id);
      for (const account of accounts) {
        try {
          const serverAddress = await syncService.syncAddress(
            wallet.id,
            account.chain,
            account.address
          );
          // 更新 server_address_id 如果它改变了（服务端重置 → 新 UUID）
          if (serverAddress.id !== account.serverAddressId) {
            await localAccountService.updateAccount(account.id, {
              server_address_id: serverAddress.id,
            });
          }
        } catch {
          // 单个地址同步失败，继续下一个
        }
      }
    }
  } catch {
    // silent — 同步失败不应阻塞应用启动
  }
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
