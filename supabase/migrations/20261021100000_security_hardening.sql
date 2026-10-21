-- =============================================================================
-- Migration: Security Hardening (Phase 2)
-- Purpose:
--   1. Add updated_at auto-maintenance trigger on documents.
--   2. Enforce append-only semantics on audit_logs.
--   3. Enable RLS on all application tables as defense-in-depth.
--
-- This migration does NOT modify the original schema migration.
-- It layers security controls on top of the existing tables.
--
-- Architecture note: All application data access goes through the Express API
-- using a server-side DATABASE_URL connection. RLS policies here act as
-- defense-in-depth — they prevent accidental exposure if the Supabase Data
-- API is ever accessed directly by anon/authenticated roles.
--
-- The users.password_hash column from the original migration is retained for
-- backward compatibility. The intended auth strategy is Supabase Auth for
-- identity. password_hash may be repurposed or dropped in a future migration
-- once the auth integration is fully implemented.
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
--    Prevents UPDATE and DELETE on audit_logs rows from non-superuser roles.
--    The postgres superuser can still override this if absolutely necessary
--    (e.g., GDPR data-deletion), but normal application roles cannot tamper
--    with the audit trail.
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

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — defense-in-depth
--
--    Strategy: All tables have RLS enabled. Since application data access
--    is routed through the Express API (which connects via a server-side
--    DATABASE_URL, typically the postgres or service_role), we create
--    permissive policies that allow the service_role full access while
--    blocking anon and authenticated roles from direct Data API access.
--
--    If the Supabase Data API is disabled or restricted in the future,
--    these policies still provide a safety net.
-- ---------------------------------------------------------------------------

-- 3a. users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow the service_role (used by the Express backend) full access.
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
