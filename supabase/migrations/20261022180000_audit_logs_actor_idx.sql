-- =============================================================================
-- Migration: Add index on audit_logs.actor_id for administrative audit queries (Phase 7)
-- Purpose:
--   Optimizes administrative filtering of audit records by actor_id combined with
--   reverse chronological ordering (created_at DESC).
--
-- Existing indexes on public.audit_logs:
--   1. audit_logs_created_idx: ON public.audit_logs(created_at DESC)
--   2. audit_logs_document_idx: ON public.audit_logs(document_id, created_at DESC)
--
-- This migration adds:
--   audit_logs_actor_idx: ON public.audit_logs(actor_id, created_at DESC)
--
-- Note:
--   This migration is prepared locally for Phase 7 review.
--   Do NOT apply remotely without explicit review and approval.
-- =============================================================================

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
    ON public.audit_logs(actor_id, created_at DESC);
