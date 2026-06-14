import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { logger } from "../utils/logger";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        // Log validation failure with details for debugging
        logger.warn(
          "VALIDATION",
          `请求参数校验失败: ${req.method} ${req.originalUrl}`,
          {
            body: req.body,
            errors: details,
            userId: req.user?.userId,
          },
          req
        );

        res.status(400).json({
          error: "Validation failed",
          details,
        });
        return;
      }
      next(err);
    }
  };
}
