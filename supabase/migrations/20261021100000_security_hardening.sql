-- =============================================================================
-- Migration: Security Hardening (Phase 2 / Phase 3)
-- Purpose:
--   1. Add updated_at auto-maintenance trigger on documents.
--   2. Enforce append-only semantics on audit_logs (blocking UPDATE, DELETE, TRUNCATE).
--   3. Enable RLS on all application tables as defense-in-depth.
--
-- This migration does NOT modify the original schema migration.
-- It layers security controls on top of the existing tables.
--
-- Architecture note on Database Access and RLS:
--   The Express backend currently connects via direct PostgreSQL TCP (DATABASE_URL)
--   as the 'postgres' user, which possesses the BYPASSRLS attribute (usebypassrls: true).
--   Consequently, table-level RLS policies do NOT govern queries issued by the
--   Express backend; all per-document authorization and role checks MUST be
--   strictly enforced in Express application code.
--
--   The RLS policies defined here grant access to the 'service_role' database role.
--   These policies act as defense-in-depth to protect tables if accessed through
--   the Supabase PostgREST Data API, ensuring that 'anon' and 'authenticated'
--   roles are blocked by default while administrative scripts or service-role clients
--   retain access.
--
-- Supabase Auth compatibility note:
--   The users.password_hash column from the original migration remains NOT NULL
--   in this migration. Because Supabase Auth manages password hashing internally
--   in auth.users, compatibility between auth.users and public.users (such as
--   dropping NOT NULL on password_hash or establishing a user-sync trigger)
--   must be resolved in the Phase 4 schema/auth design before live user ingestion.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: auto-update documents.updated_at on row modification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_set_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Trigger: append-only enforcement on audit_logs
--
--    Prevents UPDATE, DELETE, and TRUNCATE on audit_logs. The trigger function
--    raises an unconditional exception on any modification attempt.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.deny_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: % operations are not permitted', TG_OP;
END;
$$;

CREATE TRIGGER trg_audit_logs_deny_update
    BEFORE UPDATE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.deny_audit_log_modification();

CREATE TRIGGER trg_audit_logs_deny_delete
    BEFORE DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.deny_audit_log_modification();

CREATE TRIGGER trg_audit_logs_deny_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.deny_audit_log_modification();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — defense-in-depth
--
--    Strategy: All tables have RLS enabled. As noted above, direct backend
--    connections via 'postgres' bypass RLS. These policies define access
--    for the 'service_role' role under Supabase Data API access and ensure
--    unauthorized roles (anon, authenticated) are denied direct Data API access.
-- ---------------------------------------------------------------------------

-- 3a. users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_users
    ON public.users
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3b. documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_documents
    ON public.documents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3c. document_permissions
ALTER TABLE public.document_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_document_permissions
    ON public.document_permissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3d. audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_audit_logs
    ON public.audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3e. sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_sessions
    ON public.sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
