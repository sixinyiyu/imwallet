import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface NotificationResult {
  id: string;
  walletId: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

/** 获取设备的通知列表（基于订阅的钱包） */
export async function getDeviceNotifications(deviceId: string): Promise<NotificationResult[]> {
  // 1. 获取该设备订阅的所有钱包 ID
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    select: { wallet_id: true },
  });
  const walletIds = subscriptions.map((s: any) => s.wallet_id);

  if (walletIds.length === 0) {
    return [];
  }

  // 2. 获取这些钱包的所有通知
  const notifications = await prisma.notification.findMany({
    where: { wallet_id: { in: walletIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 3. 获取该设备对每条通知的阅读状态
  const notificationIds = notifications.map((n: any) => n.id);
  const readStatuses = await prisma.notificationRead.findMany({
    where: {
      notification_id: { in: notificationIds },
      device_id: deviceId,
    },
  });

  // 4. 构建阅读状态 Map
  const readMap = new Map<string, boolean>();
  for (const rs of readStatuses) {
    readMap.set(rs.notification_id, rs.isRead);
  }

  // 5. 合并通知和阅读状态
  return notifications.map((n: any) => ({
    id: n.id,
    walletId: n.wallet_id,
    title: n.title,
    content: n.content,
    type: n.type,
    isRead: readMap.get(n.id) ?? false,
    createdAt: n.createdAt,
  }));
}

/** 标记通知已读（为当前设备创建/更新阅读状态） */
export async function markAsRead(notificationId: string, deviceId: string): Promise<void> {
  // 验证该设备有权查看此通知（通过钱包订阅）
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw createError(404, "通知不存在");
  }

  const subscription = await prisma.walletSubscription.findFirst({
    where: {
      wallet_id: notification.wallet_id,
      device_id: deviceId,
    },
  });

  if (!subscription) {
    throw createError(403, "无权访问该通知");
  }

  // 创建或更新阅读状态
  await prisma.notificationRead.upsert({
    where: {
      notification_id_device_id: { notification_id: notificationId, device_id: deviceId },
    },
    update: { isRead: true, readAt: new Date() },
    create: {
      notification_id: notificationId,
      device_id: deviceId,
      isRead: true,
      readAt: new Date(),
    },
  });
}

/** 标记所有通知已读（为当前设备） */
export async function markAllAsRead(deviceId: string): Promise<void> {
  // 获取该设备订阅的所有钱包 ID
  const subscriptions = await prisma.walletSubscription.findMany({
    where: { device_id: deviceId },
    select: { wallet_id: true },
  });
  const walletIds = subscriptions.map((s: any) => s.wallet_id);

  if (walletIds.length === 0) {
    return;
  }

  // 获取这些钱包的所有通知 ID
  const notifications = await prisma.notification.findMany({
    where: { wallet_id: { in: walletIds } },
    select: { id: true },
  });
  const notificationIds = notifications.map((n: any) => n.id);

  if (notificationIds.length === 0) {
    return;
  }

  // 批量创建阅读状态：先查已存在的，再批量创建缺失的
  const existingReads = await prisma.notificationRead.findMany({
    where: {
      notification_id: { in: notificationIds },
      device_id: deviceId,
    },
    select: { notification_id: true },
  });
  const existingIds = new Set(existingReads.map((r: any) => r.notification_id));

  const toCreate = notificationIds.filter((nid: string) => !existingIds.has(nid));

  // 批量更新已存在的为已读
  if (existingIds.size > 0) {
    await prisma.notificationRead.updateMany({
      where: {
        notification_id: { in: Array.from(existingIds) },
        device_id: deviceId,
      },
      data: { isRead: true, readAt: new Date() },
    });
  }

  // 批量创建未存在的阅读状态
  if (toCreate.length > 0) {
    await prisma.notificationRead.createMany({
      data: toCreate.map((nid: string) => ({
        notification_id: nid,
        device_id: deviceId,
        isRead: true,
        readAt: new Date(),
      })),
    });
  }

  logger.info("NOTIFICATION", `标记所有通知已读: deviceId=${deviceId.slice(0, 8)}..., count=${notificationIds.length}`);
}