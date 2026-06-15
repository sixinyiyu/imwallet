import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth";
import * as authService from "../services/authService";
import rateLimit from "express-rate-limit";

const router = Router();

// 登录限流：每IP每15分钟最多5次
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 注册限流：每IP每15分钟最多3次
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many registration attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.post(
  "/register",
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  })
);

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    res.json(result);
  })
);

export default router;