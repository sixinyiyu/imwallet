import { getDatabase, nowISO } from "../db/database";
import type { Notification } from "../types";

function rowToNotification(row: Record<string, any>): Notification {
  return {
    id: row.id,
    walletId: row.wallet_id,
    title: row.title,
    content: row.content,
    type: row.type,
    isRead: row.is_read === 1 || row.is_read === true,
    createdAt: row.created_at,
  };
}

export const localNotificationService = {
  /** 批量插入通知（从服务端同步下来），按 id 去重 */
  async syncNotifications(items: Array<{
    id: string;
    walletId: string;
    title: string;
    content: string;
    type: string;
    createdAt: string;
  }>): Promise<void> {
    const db = await getDatabase();
    const now = nowISO();
    for (const item of items) {
      const existing = await db.selectOne("notifications", { where: { id: item.id } });
      if (existing) continue;

      await db.insert("notifications", {
        id: item.id,
        wallet_id: item.walletId,
        title: item.title,
        content: item.content,
        type: item.type,
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

  /** 删除钱包关联的所有通知（钱包删除时调用） */
  async deleteWalletNotifications(walletId: string): Promise<void> {
    const db = await getDatabase();
    await db.remove("notifications", { wallet_id: walletId });
  },
};
