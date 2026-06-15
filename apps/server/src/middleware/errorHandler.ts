import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { config } from "../config";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 ? "Internal server error" : err.message;

  // Log all errors (not just 500)
  if (statusCode === 500) {
    logger.error(
      "ERROR",
      `服务端内部错误: ${req.method} ${req.originalUrl}`,
      {
        error: err.message,
        stack: err.stack,
        userId: req.user?.userId,
      },
      req
    );
  } else {
    // Log 4xx errors with useful context for debugging
    logger.warn(
      "ERROR",
      `请求错误 [${statusCode}]: ${req.method} ${req.originalUrl} - ${err.message}`,
      {
        statusCode,
        message: err.message,
        code: err.code,
        userId: req.user?.userId,
        body: req.body,
      },
      req
    );
  }

  res.status(statusCode).json({
    error: message,
    ...(err.code && { code: err.code }),
    ...(config.nodeEnv === "development" && { stack: err.stack }),
  });
}

export function createError(statusCode: number, message: string, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}