import { Request, Response, NextFunction } from "express";
import { createError } from "./errorHandler";
import prisma from "../config/prisma";

/**
 * Role-based access control middleware.
 * Checks if the authenticated user has the required role by querying the database.
 */
export function roleMiddleware(requiredRole: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true, deletedAt: true },
      });

      if (!user || user.deletedAt) {
        res.status(401).json({ error: "User not found or deleted", code: "USER_NOT_FOUND" });
        return;
      }

      if (user.role !== requiredRole) {
        res.status(403).json({ error: "Insufficient permissions", code: "INSUFFICIENT_PERMISSIONS" });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}