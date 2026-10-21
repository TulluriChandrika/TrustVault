-- =============================================================================
-- Migration: Align Users Schema for Supabase Auth (Phase 4)
-- Purpose:
--   1. Make public.users.password_hash nullable (DROP NOT NULL).
--   2. Allow Supabase Auth to act as the sole password-authentication system,
--      storing credentials inside auth.users while public.users acts as the
--      application profile and role-mapping table.
--
-- Note:
--   This migration is prepared locally for Phase 4 authentication integration.
--   Do NOT apply remotely without explicit review and approval.
-- =============================================================================

ALTER TABLE public.users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users
    ALTER COLUMN password_hash SET DEFAULT NULL;

COMMENT ON COLUMN public.users.password_hash IS
    'Optional legacy or server-managed hash; Supabase Auth manages identity credentials inside auth.users.';
