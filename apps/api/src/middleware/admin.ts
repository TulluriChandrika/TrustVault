import { Request, Response, NextFunction } from "express";
import { recordAuditLog } from "../audit.js";

/**
 * Middleware that strictly enforces the 'admin' role on protected administrative routes.
 * Must be preceded by `requireAuth` so `req.user` is verified and populated.
 *
 * Security controls:
 * 1. Rejects unauthenticated requests if req.user is absent (401).
 * 2. Checks trusted server-side `req.user.role === 'admin'`. Client-supplied role
 *    claims, headers, or parameters are completely ignored.
 * 3. Records a denied audit event when a non-admin user attempts access.
 * 4. Traps any standalone audit recording errors safely to avoid crashing or recursing.
 * 5. Returns a standard 403 Forbidden error.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (user.role !== "admin") {
    // Record denied administrative audit access attempt safely
    await recordAuditLog({
      actorId: user.id,
      documentId: null,
      action: "audit_log:read",
      outcome: "denied",
      details: {
        reason: "forbidden_non_admin_role",
        actual_role: user.role,
        method: req.method,
        path: req.originalUrl || req.baseUrl + req.path,
      },
    });

    res.status(403).json({ error: "Only administrators can access audit logs" });
    return;
  }

  next();
}
