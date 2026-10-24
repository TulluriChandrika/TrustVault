-- =============================================================================
-- Migration: Support Global Roles ('admin', 'owner', 'viewer', 'user') & Profile
-- Purpose:
--   1. Idempotently ensure public.users.full_name column exists.
--   2. Update the role CHECK constraint to allow 'admin', 'owner', 'viewer', and 'user'.
--   3. Preserve existing legacy 'user' accounts without automated promotion.
--   4. Keep 'user' in the constraint for backward compatibility.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users 
  ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'owner', 'viewer', 'user'));


