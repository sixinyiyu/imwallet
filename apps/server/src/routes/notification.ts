import { Router, Request, Response, NextFunction } from "express";
import { deviceAuthMiddleware } from "../middleware/deviceAuth";
import * as notificationService from "../services/notificationService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.use(deviceAuthMiddleware);

// 获取当前设备的通知列表
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const notifications = await notificationService.getDeviceNotifications(req.device!.dbId);
  res.json({ notifications });
}));

// 标记通知已读
router.put("/:id/read", asyncHandler(async (req: Request, res: Response) => {
  await notificationService.markAsRead(req.params.id as string, req.device!.dbId);
  res.json({ message: "Notification marked as read" });
}));

// 标记所有通知已读
router.put("/read-all", asyncHandler(async (req: Request, res: Response) => {
  await notificationService.markAllAsRead(req.device!.dbId);
  res.json({ message: "All notifications marked as read" });
}));

export default router;
