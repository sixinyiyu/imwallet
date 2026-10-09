import { getDatabase, nowISO } from "../db/database";
import type { AssetBalance } from "../types";

/**
 * 离线余额缓存服务。
 *
 * 将服务端 `/wallets/{id}/balance` 的最近一次成功结果持久化到本地
 * `wallet_balances` 表，用于服务端不可用时展示上次余额/代币，
 * 并在 UI 上标注「数据可能已过期」。
 *
 * 存储格式（wallet_balances 表）：
 *   id                 TEXT PRIMARY KEY   — 与 wallet_id 相同（兼容两种适配器）
 *   wallet_id          TEXT               — 钱包 ID
 *   total_balance_usd  TEXT               — 总余额（USD）
 *   total_balance_cny  TEXT               — 总余额（CNY）
 *   assets             TEXT (JSON)        — AssetBalance[] 序列化
 *   updated_at         TEXT (ISO)         — 缓存时间，用于判断数据新鲜度
 */

export interface CachedBalance {
  walletId: string;
  totalBalanceUsd: string;
  totalBalanceCny: string;
  assets: AssetBalance[];
  updatedAt: string;
}

function rowToCached(row: Record<string, any>): CachedBalance {
  let assets: AssetBalance[] = [];
  try {
    const parsed = JSON.parse(row.assets ?? "[]");
    if (Array.isArray(parsed)) assets = parsed as AssetBalance[];
  } catch {
    assets = [];
  }
  return {
    walletId: row.wallet_id,
    totalBalanceUsd: String(row.total_balance_usd ?? "0"),
    totalBalanceCny: String(row.total_balance_cny ?? "0"),
    assets,
    updatedAt: row.updated_at ?? "",
  };
}

export const localBalanceService = {
  /** 读取某钱包的缓存余额（无缓存返回 null） */
  async getBalance(walletId: string): Promise<CachedBalance | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("wallet_balances", {
      where: { wallet_id: walletId },
    });
    return row ? rowToCached(row) : null;
  },

  /** 写入/更新某钱包的缓存余额（upsert） */
  async saveBalance(data: {
    walletId: string;
    totalBalanceUsd: string;
    totalBalanceCny: string;
    assets: AssetBalance[];
  }): Promise<void> {
    const db = await getDatabase();
    const now = nowISO();
    // 先删除再插入，保证 upsert 语义（兼容 IndexedDB / SQLite 两种适配器）
    await db.remove("wallet_balances", { wallet_id: data.walletId });
    await db.insert("wallet_balances", {
      id: data.walletId,
      wallet_id: data.walletId,
      total_balance_usd: String(data.totalBalanceUsd ?? "0"),
      total_balance_cny: String(data.totalBalanceCny ?? "0"),
      assets: JSON.stringify(data.assets ?? []),
      updated_at: now,
    });
  },

  /** 删除某钱包的缓存余额（删除钱包时调用） */
  async deleteBalance(walletId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("wallet_balances", { wallet_id: walletId });
  },
};

/**
 * 缓存是否「过期」——超过 staleMs 视为过期。
 * 用于 UI 提示「数据可能已过期」。默认 5 分钟。
 */
export function isBalanceStale(updatedAt: string, staleMs = 5 * 60 * 1000): boolean {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > staleMs;
}
