import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

/**
 * GET /api/auth/me or GET /api/me
 * Returns the currently authenticated user's profile.
 * Only safe, non-sensitive attributes are returned (no secrets or password hashes).
 */
authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    },
  });
});
