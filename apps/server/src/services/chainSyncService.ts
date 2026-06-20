import prisma from "../config/prisma";
import { logger } from "../utils/logger";
import { v4 as uuid } from "uuid";

/**
 * Chain sync service — runs on every app startup.
 * Ensures all existing wallets have accounts for every supported chain's every token.
 * When a new chain or token is added to the system, this service automatically
 * creates the corresponding account and wallet token entries for all wallets.
 *
 * Each chain creates separate accounts per token (e.g., Tron TRX account + Tron USDT account),
 * enabling independent accounting per token.
 */
export async function syncChainAccounts(): Promise<void> {
  try {
    // 1. Find all supported chains
    const supportedChains = await prisma.chain.findMany({
      where: { isAccountSupported: true },
    });

    if (supportedChains.length === 0) {
      logger.info("CHAIN_SYNC", "无支持创建账户的链，跳过同步");
      return;
    }

    // 2. Find all wallets
    const wallets = await prisma.wallet.findMany();
    if (wallets.length === 0) {
      logger.info("CHAIN_SYNC", "无钱包，跳过同步");
      return;
    }

    let createdAccounts = 0;
    let createdWalletTokens = 0;

    for (const wallet of wallets) {
      // 3. Check which (network, tokenSymbol) combinations this wallet already has accounts for
      const existingAccounts = await prisma.account.findMany({
        where: { walletId: wallet.id },
        select: { network: true, tokenSymbol: true },
      });
      // Build a set of "network:tokenSymbol" keys for quick lookup
      const existingKeys = new Set(
        existingAccounts.map((a: any) => `${a.network}:${a.tokenSymbol || ""}`)
      );

      // 4. For each chain, find all tokens and create missing accounts
      for (const chain of supportedChains) {
        const chainTokens = await prisma.token.findMany({
          where: { isActive: true, network: chain.name },
        });

        if (chainTokens.length === 0) continue;

        // Check if this wallet already has ANY account on this chain
        // (to reuse the same address for all tokens on the same chain)
        const existingChainAccounts = existingAccounts.filter(
          (a: any) => a.network === chain.name
        );

        let chainAddress: string;
        if (existingChainAccounts.length > 0) {
          // Reuse the existing address for this chain
          chainAddress = (existingChainAccounts[0] as any).address;
        } else {
          // Generate a new address for this chain
          if (chain.name === "Tron") {
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            chainAddress = "T";
            for (let i = 0; i < 33; i++) {
              chainAddress += chars.charAt(Math.floor(Math.random() * chars.length));
            }
          } else {
            chainAddress = "0x" + uuid().replace(/-/g, "").slice(0, 40).toUpperCase();
          }
        }

        // For each token on this chain, create a missing account
        for (const token of chainTokens) {
          const key = `${chain.name}:${token.symbol}`;
          if (existingKeys.has(key)) continue;

          await prisma.account.create({
            data: {
              walletId: wallet.id,
              network: chain.name,
              tokenSymbol: token.symbol,
              name: `${chain.displayName} ${token.symbol}`,
              address: chainAddress,
            },
          });
          existingKeys.add(key);
          createdAccounts++;

          logger.info(
            "CHAIN_SYNC",
            `为钱包 ${wallet.alias}(${wallet.id.slice(0, 8)}...) 创建 ${chain.name}/${token.symbol} 账户: ${chainAddress.slice(0, 10)}...`
          );
        }

        // Create WalletToken entries for tokens that don't have them yet
        const existingWTs = await prisma.walletToken.findMany({
          where: { walletId: wallet.id },
          select: { tokenId: true },
        });
        const existingTokenIds = new Set(existingWTs.map((wt: any) => wt.tokenId));

        const newTokens = chainTokens.filter((t: any) => !existingTokenIds.has(t.id));

        if (newTokens.length > 0) {
          await prisma.walletToken.createMany({
            data: newTokens.map((t: any) => ({
              walletId: wallet.id,
              tokenId: t.id,
              balance: 0,
            })),
          });
          createdWalletTokens += newTokens.length;
        }
      }
    }

    if (createdAccounts > 0 || createdWalletTokens > 0) {
      logger.info("CHAIN_SYNC", `同步完成: 创建 ${createdAccounts} 个账户, ${createdWalletTokens} 个代币余额记录`);
    } else {
      logger.info("CHAIN_SYNC", "所有钱包已同步，无需创建新账户");
    }
  } catch (err: any) {
    logger.warn("CHAIN_SYNC", `链账户同步失败: ${err.message}`);
  }
}
