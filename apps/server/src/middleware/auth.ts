import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logger } from "../utils/logger";
import prisma from "../config/prisma";

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

    // 校验用户实时状态：是否活跃且未被删除
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { status: true, deletedAt: true },
    }).then((user) => {
      if (!user || user.deletedAt || user.status !== "ACTIVE") {
        logger.warn("AUTH", `认证失败: 用户状态异常 - userId=${payload.userId}, status=${user?.status}`);
        res.status(401).json({ error: "Account is not active" });
        return;
      }
      req.user = payload;
      next();
    }).catch((dbErr) => {
      logger.error("AUTH", `数据库查询失败: ${dbErr.message}`);
      res.status(500).json({ error: "Internal server error" });
    });

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