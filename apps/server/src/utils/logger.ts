import { Request } from "express";

export type LogLevel = "info" | "warn" | "error";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function extractRequestId(req?: Request): string {
  return (req?.headers["x-request-id"] as string) || "-";
}

function formatLog(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>, req?: Request): string {
  const timestamp = formatTimestamp();
  const requestId = extractRequestId(req);
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] [req:${requestId}] ${message}${metaStr}`;
}

export const logger = {
  info(module: string, message: string, meta?: Record<string, unknown>, req?: Request): void {
    console.log(formatLog("info", module, message, meta, req));
  },

  warn(module: string, message: string, meta?: Record<string, unknown>, req?: Request): void {
    console.warn(formatLog("warn", module, message, meta, req));
  },

  error(module: string, message: string, meta?: Record<string, unknown>, req?: Request): void {
    console.error(formatLog("error", module, message, meta, req));
  },
};
