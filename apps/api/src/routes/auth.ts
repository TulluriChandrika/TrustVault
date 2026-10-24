import { Router, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../supabase.js";
import { sanitizeString } from "../utils/validation.js";

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
      full_name: user.full_name || null,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    },
  });
});

/**
 * PATCH /api/auth/me or PATCH /api/me
 * Update authenticated user's profile information (full_name).
 * Strictly forbids updating privileged fields such as role, is_active, or id.
 */
authRouter.patch("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const body = req.body || {};

  // Reject privileged / immutable fields
  const forbiddenFields = ["id", "email", "role", "is_active", "password", "password_hash", "created_at"];
  for (const field of forbiddenFields) {
    if (field in body) {
      res.status(400).json({ error: `Field '${field}' cannot be modified by user` });
      return;
    }
  }

  if (!("full_name" in body)) {
    res.status(400).json({ error: "Field 'full_name' is required" });
    return;
  }

  const rawName = body.full_name;
  if (typeof rawName !== "string" || !rawName.trim()) {
    res.status(400).json({ error: "Full name must be a non-empty string" });
    return;
  }

  const sanitizedName = sanitizeString(rawName).slice(0, 100);
  if (!sanitizedName) {
    res.status(400).json({ error: "Full name cannot be empty" });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE public.users 
       SET full_name = $1 
       WHERE id = $2 AND is_active = true 
       RETURNING id, email, full_name, role, is_active, created_at;`,
      [sanitizedName, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User account not found or inactive" });
      return;
    }

    // Synchronize Supabase Auth metadata safely
    try {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: sanitizedName,
          name: sanitizedName,
        },
      });
    } catch (metaErr) {
      console.warn("Failed to synchronize user metadata in Supabase Auth:", metaErr);
    }

    const updatedUser = result.rows[0];
    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
        created_at: updatedUser.created_at,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to update user profile:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});
