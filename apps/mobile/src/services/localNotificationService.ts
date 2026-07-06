import { getDatabase, nowISO } from "../db/database";
import type { Notification, NotificationMetadata } from "../types";

function rowToNotification(row: Record<string, any>): Notification {
  return {
    id: row.id,
    walletId: row.wallet_id,
    title: row.title,
    content: row.content,
    type: row.type,
    metadata: parseMetadataFromRow(row.metadata),
    isRead: row.is_read === 1 || row.is_read === true,
    createdAt: row.created_at,
  };
}

/** 从本地存储的 metadata（JSON 字符串或对象）解析为 NotificationMetadata */
function parseMetadataFromRow(raw: any): NotificationMetadata | undefined {
  if (!raw) return undefined;
  // SQLite 存的是 JSON 字符串，IndexedDB 存的是对象
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof obj !== "object") return undefined;
  return {
    transactionId: obj.transaction_id || obj.transactionId,
    tokenSymbol: obj.token_symbol || obj.tokenSymbol,
    chain: obj.chain,
    amount: obj.amount,
  };
}

export const localNotificationService = {
  /** 批量插入通知（从服务端同步下来），按 id 去重，跳过已删除的 */
  async syncNotifications(items: Array<{
    id: string;
    walletId: string;
    title: string;
    content: string;
    type: string;
    createdAt: string;
    metadata?: NotificationMetadata;
  }>): Promise<void> {
    const db = await getDatabase();
    const now = nowISO();

    // 获取已删除 ID 集合，跳过这些通知
    const deletedIds = await localNotificationService.getDeletedIds();

    for (const item of items) {
      if (deletedIds.has(item.id)) continue;

      const existing = await db.selectOne("notifications", { where: { id: item.id } });
      if (existing) continue;

      // metadata 存为 JSON 字符串（兼容 SQLite 和 IndexedDB）
      const metadataJson = item.metadata ? JSON.stringify({
        transaction_id: item.metadata.transactionId,
        token_symbol: item.metadata.tokenSymbol,
        chain: item.metadata.chain,
        amount: item.metadata.amount,
      }) : "{}";

      await db.insert("notifications", {
        id: item.id,
        wallet_id: item.walletId,
        title: item.title,
        content: item.content,
        type: item.type,
        metadata: metadataJson,
        is_read: 0,
        created_at: item.createdAt,
        synced_at: now,
      });
    }
  },

  /** 获取所有通知（按时间倒序） */
  async getAllNotifications(): Promise<Notification[]> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("notifications", {
      orderBy: [{ column: "created_at", dir: "DESC" }],
    });
    return rows.map(rowToNotification);
  },

  /** 获取未读通知数量 */
  async getUnreadCount(): Promise<number> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("notifications", {
      where: { is_read: 0 },
    });
    return rows.length;
  },

  /** 标记单条通知已读 */
  async markAsRead(id: string): Promise<void> {
    const db = await getDatabase();
    await db.update("notifications", { is_read: 1 }, { id });
  },

  /** 标记所有通知已读 */
  async markAllAsRead(): Promise<void> {
    const db = await getDatabase();
    await db.update("notifications", { is_read: 1 }, { is_read: 0 });
  },

  /** 获取最近同步时间（用于增量同步的 since 参数） */
  async getLastSyncTime(): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.selectOne<Record<string, any>>("notifications", {
      orderBy: [{ column: "synced_at", dir: "DESC" }],
    });
    return row?.synced_at || row?.created_at || null;
  },

  /** 删除单条通知：本地物理删除 + 记录到 deleted_notification_ids */
  async deleteNotification(id: string): Promise<void> {
    const db = await getDatabase();

    // 先查出 wallet_id，用于记录 deleted ID
    const row = await db.selectOne<Record<string, any>>("notifications", { where: { id } });
    const walletId = row?.wallet_id || "";

    // 物理删除通知
    await db.remove("notifications", { id });

    // 记录到 deleted_notification_ids（防止同步时重新插入）
    if (walletId) {
      await db.insert("deleted_notification_ids", {
        id,
        wallet_id: walletId,
        deleted_at: nowISO(),
      });
    }
  },

  /** 获取所有已删除的通知 ID 集合（用于同步时跳过） */
  async getDeletedIds(): Promise<Set<string>> {
    const db = await getDatabase();
    const rows = await db.selectAll<Record<string, any>>("deleted_notification_ids");
    return new Set(rows.map((r) => r.id));
  },

  /** 删除钱包关联的所有通知 + 清空该钱包的 deleted IDs（钱包删除时调用） */
  async deleteWalletNotifications(walletId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("notifications", { wallet_id: walletId });
    // 清空该钱包的 deleted IDs，重新订阅后旧通知可正常拉取
    await db.remove("deleted_notification_ids", { wallet_id: walletId });
  },
};
