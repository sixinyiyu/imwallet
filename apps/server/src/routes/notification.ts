import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import * as notificationService from "../services/notificationService";

const router = Router();

router.use(authMiddleware);

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/** GET / - 获取通知列表 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await notificationService.getUserNotifications(userId, page, limit);
    res.json(result);
  })
);

/** GET /unread-count - 获取未读数量 */
router.get(
  "/unread-count",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const count = await notificationService.getUnreadCount(userId);
    res.json({ count });
  })
);

/** PUT /:id/read - 标记已读 */
router.put(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    await notificationService.markAsRead(req.params.id, userId);
    res.json({ success: true });
  })
);

/** PUT /read-all - 全部标记已读 */
router.put(
  "/read-all",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    await notificationService.markAllAsRead(userId);
    res.json({ success: true });
  })
);

export default router;