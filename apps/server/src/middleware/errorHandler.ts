import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 ? "Internal server error" : err.message;

  if (statusCode === 500) {
    console.error("[ERROR]", err);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

export function createError(statusCode: number, message: string, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}