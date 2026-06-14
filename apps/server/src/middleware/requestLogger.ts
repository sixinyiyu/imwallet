import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * HTTP request logging middleware.
 * Logs method, URL, status code, and response time for every request.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  // Capture the original end method to log after response is sent
  const originalEnd = res.end;
  res.end = function (this: Response, ...args: unknown[]) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

    logger[level](
      "HTTP",
      `${method} ${originalUrl} → ${status} (${duration}ms)`,
      {
        method,
        url: originalUrl,
        status,
        duration,
        ip: req.ip,
        userId: req.user?.userId,
      },
      req
    );

    return originalEnd.apply(this, args as [any, any]);
  } as any;

  next();
}
