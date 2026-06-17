import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

export interface NotificationResult {
  id: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

/** 获取设备的通知列表 */
export async function getDeviceNotifications(deviceDbId: number): Promise<NotificationResult[]> {
  const notifications = await prisma.notification.findMany({
    where: { device_id: deviceDbId },
    orderBy: { createdAt: "desc" },
  });

  return notifications.map((n: any) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    type: n.type,
    isRead: n.isRead,
    createdAt: n.createdAt,
  }));
}

/** 标记通知已读 */
export async function markAsRead(notificationId: string, deviceDbId: number): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.device_id !== deviceDbId) {
    throw createError(404, "Notification not found");
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

/** 标记所有通知已读 */
export async function markAllAsRead(deviceDbId: number): Promise<void> {
  await prisma.notification.updateMany({
    where: { device_id: deviceDbId, isRead: false },
    data: { isRead: true },
  });
}
