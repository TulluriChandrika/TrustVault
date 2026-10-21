import { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool.js";
import { getSupabaseAdmin } from "../supabase.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  is_active: boolean;
  created_at: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that validates the Supabase access token in the Authorization header,
 * verifies identity against Supabase Auth, idempotently synchronizes the user profile
 * in public.users, and rejects inactive accounts.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Authorization header is required" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1].trim()) {
    res.status(401).json({
      error: "Invalid authorization format. Expected 'Bearer <token>'",
    });
    return;
  }

  const token = parts[1].trim();

  let authUser: { id: string; email?: string } | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired authentication token" });
      return;
    }

    authUser = {
      id: user.id,
      email: user.email,
    };
  } catch (err: unknown) {
    res.status(401).json({ error: "Invalid or expired authentication token" });
    return;
  }

  if (!authUser.email) {
    res.status(400).json({ error: "Authenticated user must have an associated email" });
    return;
  }

  try {
    // Idempotent user provisioning:
    // 1. If user doesn't exist, insert with default role 'owner' and is_active = true.
    // 2. If user already exists, update email in case it changed in Supabase Auth,
    //    WITHOUT touching the existing role or is_active status.
    const query = `
      INSERT INTO public.users (id, email, password_hash, role, is_active)
      VALUES ($1, $2, 'SUPABASE_AUTH_MANAGED', 'owner', true)
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email
      RETURNING id, email, role, is_active, created_at;
    `;

    const result = await pool.query(query, [authUser.id, authUser.email]);
    const dbUser = result.rows[0];

    // Check account active status
    if (!dbUser.is_active) {
      res.status(403).json({ error: "Account is deactivated" });
      return;
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      is_active: dbUser.is_active,
      created_at: dbUser.created_at,
    };

    next();
  } catch (err: unknown) {
    const pgError = err as { code?: string; message?: string };
    if (pgError.code === "23505") {
      // Unique violation on email
      res.status(409).json({
        error: "Email address is already associated with another TrustVault account",
      });
      return;
    }

    res.status(500).json({ error: "Failed to resolve user account" });
  }
}
