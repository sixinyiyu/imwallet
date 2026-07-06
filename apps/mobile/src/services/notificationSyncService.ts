import api from "./api";
import { localNotificationService } from "./localNotificationService";
import { saveLogToLocal } from "./logService";
import { getErrorMessage } from "../utils/format";
import type { NotificationMetadata } from "../types";

export const notificationSyncService = {
  /**
   * 从服务端增量同步通知到本地。
   * 基于 lastSyncTime 只拉取新通知，避免全量拉取。
   * 同步失败不抛异常，返回 0（不阻塞调用方）。
   */
  async syncNotifications(): Promise<number> {
    try {
      const lastSyncTime = await localNotificationService.getLastSyncTime();

      const params: Record<string, string> = {};
      if (lastSyncTime) {
        params.since = lastSyncTime;
      }

      const { data } = await api.get("/notifications/sync", { params });
      const serverNotifications = data.notifications || [];

      if (serverNotifications.length === 0) return 0;

      await localNotificationService.syncNotifications(
        serverNotifications.map((n: any) => ({
          id: n.id,
          walletId: n.walletId,
          title: n.title,
          content: n.content,
          type: n.type,
          metadata: parseMetadata(n.metadata),
          createdAt: n.createdAt,
        }))
      );

      saveLogToLocal("info", `[notificationSync] 同步 ${serverNotifications.length} 条通知`);
      return serverNotifications.length;
    } catch (err: unknown) {
      saveLogToLocal("crash", `[notificationSync] 同步失败: ${getErrorMessage(err, "未知错误")}`);
      return 0;
    }
  },
};

/** 解析服务端返回的 metadata（JSONB → NotificationMetadata） */
function parseMetadata(raw: any): NotificationMetadata | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    transactionId: raw.transaction_id || raw.transactionId,
    tokenSymbol: raw.token_symbol || raw.tokenSymbol,
    chain: raw.chain,
    amount: raw.amount,
  };
}