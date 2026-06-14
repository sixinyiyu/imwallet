import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import { roleMiddleware } from "../middleware/role";
import * as authService from "../services/authService";

const router = Router();

// 所有管理员路由需要登录 + ADMIN 角色
router.use(authMiddleware);
router.use(roleMiddleware("ADMIN"));

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/** GET /users - 获取所有用户列表（排除软删除） */
router.get(
  "/users",
  asyncHandler(async (req: Request, res: Response) => {
    const users = await authService.getAllUsers();
    res.json({ users });
  })
);

/** GET /users/pending - 获取待审核用户列表 */
router.get(
  "/users/pending",
  asyncHandler(async (req: Request, res: Response) => {
    const users = await authService.getPendingUsers();
    res.json({ users });
  })
);

/** PUT /users/:id/activate - 激活用户 */
router.put(
  "/users/:id/activate",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.activateUser(req.params.id as string, req.user?.userId);
    res.json(result);
  })
);

/** PUT /users/:id/reject - 拒绝用户 */
router.put(
  "/users/:id/reject",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.rejectUser(req.params.id as string, req.user?.userId);
    res.json(result);
  })
);

/** PUT /users/:id/deactivate - 停用用户 */
router.put(
  "/users/:id/deactivate",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.deactivateUser(req.params.id as string, req.user?.userId);
    res.json(result);
  })
);

/** DELETE /users/:id - 软删除用户 */
router.delete(
  "/users/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.softDeleteUser(req.params.id as string, req.user?.userId);
    res.json(result);
  })
);

export default router;
