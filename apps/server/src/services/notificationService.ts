import prisma from "../config/prisma";
import { createError } from "../middleware/errorHandler";

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}

export async function createNotification(
  userId: string,
  title: string,
  content: string,
  type: string
): Promise<NotificationItem> {
  const notification = await prisma.notification.create({
    data: {
      userId,
      title,
      content,
      type: type as any,
    },
  });
  return {
    id: notification.id,
    title: notification.title,
    content: notification.content,
    type: notification.type,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  };
}

export async function getUserNotifications(
  userId: string,
  page?: number,
  limit?: number
): Promise<{ notifications: NotificationItem[]; total: number }> {
  const p = page || 1;
  const l = Math.min(limit || 20, 100);

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * l,
      take: l,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    notifications: notifications.map((n: any) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      type: n.type,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
    total,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw createError(404, "Notification not found");
  }

  if (notification.userId !== userId) {
    throw createError(403, "Not your notification");
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}