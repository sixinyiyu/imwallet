import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../validators/auth";
import * as authService from "../services/authService";

const router = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  })
);

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    res.json(result);
  })
);

export default router;