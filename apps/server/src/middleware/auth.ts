import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logger } from "../utils/logger";

export interface AuthPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    logger.warn(
      "AUTH",
      `认证失败: 缺少或无效的Authorization头 - ${req.method} ${req.originalUrl}`,
      { ip: req.ip },
      req
    );
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.user = payload;
    next();
  } catch (err: any) {
    const reason = err.name === "TokenExpiredError" ? "Token已过期" : "Token无效";
    logger.warn(
      "AUTH",
      `认证失败: ${reason} - ${req.method} ${req.originalUrl}`,
      { reason, errorName: err.name, ip: req.ip },
      req
    );
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
