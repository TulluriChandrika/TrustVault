# TrustVault — Threat Model and Security Assessment

## 1. Purpose

TrustVault is a secure document-sharing application intended to let document owners share confidential files with specifically authorized users while maintaining an auditable record of important security events.

This document identifies important threats, their potential impact, planned mitigations, and the verification needed to demonstrate security.

It describes the project status based on the implementation and migration-review information available as of 2026-10-21. It must be updated when security features are implemented and tested.

## 2. System Overview

### Intended architecture

- **Frontend:** React, TypeScript, and Vite.
- **Backend:** Node.js, Express, and TypeScript.
- **Database:** PostgreSQL through Supabase.
- **Identity provider:** Supabase Auth, subject to completion of the integration.
- **File storage:** Private Supabase Storage bucket intended to be named `trustvault-private`.
- **Database access:** PostgreSQL connection through the `pg` package.
- **Security evidence:** Application audit records and automated security tests.

### Existing database schema

The initial migration defines these tables:

- `public.users`
- `public.documents`
- `public.document_permissions`
- `public.audit_logs`
- `public.sessions`

The subsequent local security-hardening migration defines:

- Row-Level Security (RLS) enablement and policies.
- A trigger that updates `documents.updated_at`.
- Triggers that reject row-level updates and deletes on `audit_logs`.

Migration status was confirmed using `npx supabase migration list` and verified via direct read-only inspection of remote `information_schema` and `pg_catalog` on 2026-10-21:

- `20261020161206`: Recorded as applied remotely; verified that all 5 tables (`users`, `documents`, `document_permissions`, `audit_logs`, `sessions`), columns, foreign keys, unique constraints, and indexes exist on the remote database.
- `20261021100000`: Present locally but not recorded as applied remotely; confirmed that the remote database currently has `rls_enabled: false` on all 5 tables, 0 triggers, and 0 custom functions in `public`.
- **Database Connection Role**: Direct backend queries via `DATABASE_URL` execute as `postgres` (`usebypassrls: true`), bypassing table RLS. RLS acts as defense-in-depth against direct access via Supabase PostgREST Data API roles (`anon`, `authenticated`).

## 3. Assets to Protect

1. Document contents and uploaded files.
2. Document metadata, including titles, categories, and ownership.
3. User identities and account status.
4. Document-sharing grants and revocation state.
5. Authentication tokens and server-side credentials.
6. Audit history and evidence of denied access.
7. Database integrity and availability.
8. Application configuration and deployment secrets.

## 4. Trust Boundaries

### Browser to API

The browser is untrusted. Every document ID, user ID, role, permission, filename, and request parameter must be validated by the backend.

### API to PostgreSQL

The backend may have substantial database privileges. It must enforce the application's authorization rules before performing sensitive operations.

Database privileges and RLS should provide appropriate defense in depth, but the actual connection role must be verified.

### API to object storage

Private files must not be publicly accessible by default. The API must verify authorization before granting download access.

### Administrative operations

Administrative capabilities must be explicitly defined. Access to audit information must not automatically imply permission to read every document's contents.

## 5. Threat Register

Status definitions:

- **Implemented and verified:** Implementation and relevant verification evidence exist.
- **Implemented, verification incomplete:** Code exists, but sufficient verification evidence is unavailable.
- **Planned:** A required control has not yet been demonstrated.
- **Unresolved:** A known concern needs a design decision or remediation.

### T1 — Unauthenticated access

**Asset:** Documents, metadata, permissions, and audit information.

**Threat:** An unauthenticated attacker calls protected API endpoints directly.

**Impact:** Confidentiality loss, unauthorized changes, or disclosure of sensitive activity.

**Mitigations:**
- Verify Supabase Auth tokens on the backend.
- Reject missing, invalid, and expired tokens.
- Require authentication on protected endpoints.
- Avoid trusting user identity supplied in request bodies.

**Detection:** Record appropriate denied requests without logging credentials or tokens.

**Verification:** Test requests without credentials and with invalid or expired tokens. Automated tests in `apps/api/src/auth.test.ts` verify rejection of missing Authorization header (401), non-Bearer or empty Bearer schemes (401), invalid JWT tokens (401), and expired JWT tokens (401).

**Status:** Implemented and verified for Bearer token validation on Express `/api/me` and `/api/auth/me` (Phase 4).

### T2 — Cross-user document access (IDOR/BOLA)

**Asset:** Document contents and metadata.

**Threat:** A user changes a document ID in a URL or request to access another user's document.

**Impact:** Unauthorized disclosure, editing, or deletion.

**Mitigations:**
- Check document ownership or an active permission grant on every protected request.
- Perform authorization in the backend, not only in the UI.
- Apply the same checks to metadata, previews, downloads, edits, and deletion.
- Use negative authorization tests with separate users.

**Detection:** Record denied access attempts with an appropriate actor, target, action, and outcome.

**Verification:** Owner A must not access Owner B's document without an explicit valid grant. Automated tests in `apps/api/src/documents.test.ts` verify cross-user isolation: an unauthorized user receives `404 Not Found` (preventing document existence enumeration), a denied audit record is generated, and mutations are prevented.

**Status:** Implemented and verified for document metadata in Phase 5.

### T3 — Privilege escalation

**Asset:** Administrative functions, user roles, and document permissions.

**Threat:** A viewer changes a request field or API call to claim an administrator role.

**Impact:** Unauthorized administration or disclosure of documents.

**Mitigations:**
- Determine roles from trusted server-side data (`public.users.role`).
- Restrict role changes to an explicitly authorized administrative workflow.
- Never accept role assignments from ordinary registration or user requests.
- Test every role-restricted endpoint.

**Verification:** A user must not grant themselves administrative privileges. Automated tests in `apps/api/src/auth.test.ts` verify that client role escalation attempts via request parameters/headers are ignored, and new users are strictly provisioned as `owner`.

**Status:** Implemented and verified for user provisioning and role preservation (Phase 4).

### T4 — Improper permission grants, TOCTOU races, and revocation

**Asset:** Sharing permissions, document confidentiality, and access controls.

**Threat:** An unauthorized user grants access, a user grants permissions to themselves, concurrent grants create inconsistent state, or a revoked user continues mutating/accessing a document via time-of-check/time-of-use (TOCTOU) races.

**Impact:** Persistent unauthorized access, permission corruption, or unauthorized modification after revocation.

**Mitigations:**
- Restrict grants and revocations strictly to document owners.
- Prevent self-grant: explicitly reject attempts to grant permissions to oneself or the document owner (`400 Bad Request`).
- Anti-enumeration for target users: return a generic `404 Not Found` ("Target user not found or not eligible") with denied audit logging for both non-existent and inactive user targets to prevent account existence and status enumeration.
- Prevent duplicate active grants: check existing active grants and handle concurrent race conditions by catching PostgreSQL unique constraint violations (`code 23505`) to return `409 Conflict`.
- Guard against TOCTOU races: metadata mutations (`PATCH /api/documents/:id`) enforce authorization atomically in the update query itself (`WHERE ... AND (owner_id = $4 OR EXISTS (SELECT 1 FROM document_permissions WHERE permission = 'edit' AND revoked_at IS NULL))`), rolling back and returning `403` if permission was concurrently revoked.
- Atomic revocation: revocation UPDATE queries check `rowCount === 0` to prevent false success on repeated or concurrent revocation requests (`404 Not Found`).
- Transactional audit coupling: all mutating operations (`document:create`, `document:update`, `document:delete`, `permission:grant`, `permission:revoke`) execute mutations and audit entries within the same database transaction. An audit logging failure rolls back the entire mutation.
- Check active permission state (`revoked_at IS NULL`) on every protected request.
- Ensure revocation takes effect immediately on all subsequent requests (returning `404 Not Found`).

**Concurrency Limitations:**
- If an authorized request (such as a read) executes and sends its response before a revocation transaction commits, the response reflects the authorized state at execution time.
- Node.js executes HTTP requests asynchronously; instantaneous revocation of already in-flight network packets is impossible without persistent connection termination (e.g. websockets), but all subsequent requests and any in-flight mutation that executes SQL after revocation commits are strictly blocked.

**Verification:** Automated unit/mocked tests in `apps/api/src/documents.test.ts` (30 tests) verify owner-only grant, rejection of non-owner grants (403), self-grant rejection (400), target user anti-enumeration (generic 404 for unknown or inactive targets), rejection of duplicate active grants and concurrent race handling (409), atomic revocation handling (404), rollback on audit failure across all mutation types, cross-user listing isolation, exclusion of soft-deleted documents across all endpoints, admin role isolation, and immediate 404 rejection on subsequent requests following revocation.

**Status:** Implemented, hardened, and verified in Phase 5.

### T5 — Public storage exposure

**Asset:** Uploaded documents.

**Threat:** Files become accessible through a public bucket, leaked object URL, or improperly issued signed URL.

**Impact:** Confidential documents can be downloaded without authorization.

**Mitigations:**
- Use a private storage bucket (`trustvault-private`).
- Keep service credentials on the backend (`SUPABASE_SECRET_KEY` via `getSupabaseAdmin()`).
- Generate unpredictable storage keys server-side (`private/${userId}/${uuid}.${ext}`). Never accept client-selected storage keys.
- Enforce server-side authorization before every download via `GET /api/documents/:id/download`.
- Backend-mediated streaming: downloads are mediated through the server so that permission revocation is immediate for subsequent requests.
- Prevent metadata-only records (`raw/...`) from being downloaded as if they contain real files.
- Return generic `404 Not Found` for unshared, non-existent, or soft-deleted documents (anti-enumeration).

**Limitations:**
- If a download transfer is already in flight across the network socket while revocation occurs, bytes already sent cannot be recalled. However, all subsequent download attempts are immediately denied.

**Verification:** Automated tests in `apps/api/src/documents.test.ts` verify owner, editor, and reader download access, rejection of unshared stranger access (404), rejection of revoked user access (404), rejection of soft-deleted documents (404), rejection of metadata-only records (404), and safe error handling when storage objects are missing.

**Status:** Implemented and verified in Phase 6.

### T6 — Malicious or oversized uploads

**Asset:** API availability, stored files, and downstream document-processing systems.

**Threat:** An attacker uploads oversized files, misleading file types, or malicious content.

**Impact:** Resource exhaustion, unsafe processing, or storage abuse.

**Mitigations:**
- Enforce strict 10 MB file-size limits on multipart uploads (`multer` bound and content length validation).
- Validate allowed MIME types (PDF, PNG, JPEG, WebP, Plain Text, CSV).
- Perform magic byte validation on buffer headers to detect file signatures and prevent MIME-type spoofing.
- Reject plain text and CSV files containing binary or null bytes (`0x00`).
- Sanitize filenames to prevent path traversal and control character injection.
- Generate unpredictable server-controlled storage keys independently of user filenames.
- Implement compensating cleanup: if database insertion or audit logging fails after storage upload, the orphaned object is deleted from storage.
- Ambiguous commit protection: distinguishes three transaction outcomes (`uncommitted`, `committed`, `unknown`). If the verification query fails or times out, the outcome is `unknown` and the storage object is strictly preserved. If `committed`, the server executes schema-safe soft-delete (`UPDATE public.documents SET deleted_at = now()`) before deleting storage, preserving referential integrity and audit trail history; if soft-delete fails, storage is preserved and an operational alert is logged.

**Limitations:**
- File signature / magic-byte verification validates declared headers against format signatures, but does not substitute for an active antivirus / malware scanning sandbox.
- Distributed transaction atomicity: in network partitions where database COMMIT state is ambiguous and database connectivity cannot be established to verify or clean up the database record, the storage object is preserved to avoid silent data loss, requiring operational alert monitoring.

**Verification:** Automated tests in `apps/api/src/documents.test.ts` verify rejection of empty files (400), oversized files (413), disallowed MIME types (400), spoofed magic bytes (400), text files containing null bytes (400), execution of compensating cleanup upon uncommitted database failure, preservation of storage files when verification queries fail (unknown state), and preservation of storage files during ambiguous COMMIT when soft-delete fails.

**Status:** Implemented and verified in Phase 6.

### T7 — Audit-log tampering

**Asset:** Evidence of access, sharing, and security incidents.

**Threat:** An attacker or overly privileged application role modifies, deletes, or truncates audit records, or unauthorized users view audit history.

**Impact:** Loss of accountability, unauthorized intelligence gathering, and concealment of unauthorized activity.

**Mitigations:**
- **Endpoint immutability:** The API exposes strictly read-only endpoints (`GET /api/admin/audit-logs`, `GET /api/admin/audit-logs/:id`). No `POST`, `PUT`, `PATCH`, or `DELETE` endpoints exist for audit logs (returning `404 Not Found`).
- **Strict administrative role enforcement:** `requireAdmin` verifies `req.user.role === 'admin'` strictly from server-side database records. Document owners, editors, and viewers are blocked with `403 Forbidden`.
- **Denied administrative access auditing:** Unauthorized administrative audit access attempts generate a standalone denied audit log entry (`action: "audit_log:read"`, `outcome: "denied"`) preserving the actor's ID and attempt metadata.
- **Database append-only triggers:** Local migration `20261021100000_security_hardening.sql` defines row-level `BEFORE UPDATE`, `BEFORE DELETE`, and statement-level `BEFORE TRUNCATE` triggers on `public.audit_logs` that raise unconditional PostgreSQL exceptions.
- **Transactional audit atomicity:** All mutating business operations (`document:create`, `document:update`, `document:delete`, `permission:grant`, `permission:revoke`) write their audit logs inside the same SQL transaction client. Failure to persist the audit log causes the entire transaction to roll back, guaranteeing no mutation persists without an audit trail.
- **Bounded and parameterized queries:** Administrative audit queries strictly validate inputs and pass parameters using parameterized SQL placeholders (`$1`, `$2`), eliminating SQL injection. Queries enforce bounded pagination (max 100 records per page) and deterministic ordering (`ORDER BY created_at DESC, id DESC`).
- **Privacy and sanitization:** Responses project only safe attributes (`id`, `actor_id`, `document_id`, `action`, `outcome`, `details`, `created_at`). Secrets, password hashes, and tokens are strictly excluded.
- **Query performance indexing:** Local migration `20261022180000_audit_logs_actor_idx.sql` defines an index on `(actor_id, created_at DESC)` to optimize administrative filtering by actor alongside the existing created_at and document_id indexes.

**Limitations:**
- **Standalone audit persistence failure window:** Standalone audit records (e.g. read denials, connection aborts) attempt to insert via `pool.query`. If PostgreSQL is offline, network partitioned, or experiencing storage exhaustion, the insert will fail. Standalone errors are caught and logged to stderr to avoid crashing the server process or recursing, but the audit entry cannot be guaranteed to persist during a database outage.
- **Direct database access:** Append-only triggers protect against application queries, but direct access by a PostgreSQL superuser can disable triggers or alter tables directly.
- **Remote migration status:** Security triggers in `20261021100000` and the actor index in `20261022180000` are prepared locally and must be reviewed before remote application.

**Verification:** Automated unit tests in `apps/api/src/audit.test.ts` (29 tests) verify:
1. 401 rejection for unauthenticated requests across all audit endpoints.
2. 403 rejection and denied audit log generation for non-admin roles (`owner`, `viewer`).
3. Rejection of client-supplied role escalation attempts via headers, queries, and bodies.
4. 200 retrieval of audit log lists and individual log entries for verified administrators.
5. Strict validation of pagination bounds (`limit` 1..100, `offset` >= 0) and filter parameters (`actor_id`, `document_id`, `action`, `outcome`, `start_date`, `end_date`).
6. Parameterized query construction preventing SQL injection payloads from modifying query structure.
7. 404 rejection for non-existent audit IDs and 400 for malformed numeric IDs.
8. Immutability of endpoints against POST, PUT, PATCH, and DELETE requests (404).
9. Omission of sensitive credentials, password hashes, and tokens in audit responses.
10. Safe trapping of standalone persistence failures without crashing or recursing.
11. Proper propagation of transactional audit failures to ensure rollback.

**Status:** Implemented and verified in Phase 7 for API access controls, immutability, query validation, and failure handling; database triggers and indexing remain local pending migration review.

### T8 — SQL injection

**Asset:** Database records and access controls.

**Threat:** Attacker-controlled input is incorporated into SQL statements.

**Impact:** Data disclosure, modification, or deletion.

**Mitigations:**
- Use parameterized queries.
- Never concatenate untrusted input into SQL.
- Allowlist dynamic column names and sort directions.
- Use the least database privilege compatible with the application's requirements.

**Verification:** Test search and filtering inputs with SQL metacharacters and injection payloads.

**Status:** Unverified for future database-facing application endpoints.

### T9 — Secret leakage

**Asset:** Database credentials, Supabase keys, and user sessions.

**Threat:** Secrets enter Git history, frontend bundles, logs, or public documentation.

**Impact:** Unauthorized database or storage access.

**Mitigations:**
- Keep `.env` excluded from version control.
- Maintain placeholders in `.env.example`.
- Never expose service-role or secret keys through frontend variables.
- Redact credentials from logs and error responses.
- Rotate exposed credentials and follow incident-response procedures.

**Verification:** Check ignore rules, tracked files, frontend build output, and logs for secret exposure without printing secret values.

**Status:** Phase 2 reported `.env` as untracked and excluded. Broader secret scanning and production verification remain outstanding.

### T10 — API abuse and brute-force attempts

**Asset:** API availability and authentication endpoints.

**Threat:** Repeated requests exhaust resources or repeatedly attempt account access.

**Impact:** Service degradation, account compromise, or resource exhaustion.

**Existing Phase 2 controls reported:**
- Helmet security headers.
- Rate limiting configured at 100 requests per 15 minutes.
- A 2 MB JSON body limit.

**Limitations:**
- In-memory rate limits are not shared across multiple API instances.
- Rate limiting does not replace authentication protections or endpoint-specific limits.
- Proxy trust must match the actual hosting configuration.

**Verification:** Test the configured limits and ensure protected endpoints have appropriate additional controls.

**Status:** Baseline middleware is reported implemented and tested; production suitability remains unverified.

### T11 — CORS and CSRF weaknesses

**Asset:** Authenticated user actions and browser-held credentials.

**Threat:** An untrusted origin attempts cross-origin requests, or a browser submits an unwanted state-changing request.

**Impact:** Unauthorized actions if the authentication design and browser protections permit them.

**Mitigations:**
- Restrict CORS to trusted origins.
- Do not treat CORS as authorization.
- If cookie-based authentication is used, implement appropriate CSRF defenses and cookie settings.
- Validate state-changing requests according to the selected authentication architecture.

**Verification:** Test untrusted origins and CSRF scenarios applicable to the actual authentication mechanism.

**Status:** CORS behavior is reported tested in Phase 2. CSRF protection remains dependent on the authentication design and is not established by those tests.

### T12 — Compromised or disabled accounts

**Asset:** User identity and documents accessible to that identity.

**Threat:** A stolen credential or token is used, or a disabled account retains access.

**Impact:** Unauthorized document access and changes.

**Mitigations:**
- Check account status during authorization where appropriate.
- Use secure authentication and token lifecycle handling.
- Provide a process for revoking sessions or credentials.
- Apply appropriate protections to authentication endpoints.

**Verification:** Test disabled accounts, invalidated sessions or tokens, and revoked access. Automated tests in `apps/api/src/auth.test.ts` verify that accounts with `is_active = false` in PostgreSQL are rejected with HTTP 403 Forbidden ("Account is deactivated"), and that login attempts do not automatically reactivate them.

**Status:** Implemented and verified for account deactivation enforcement on Express `/api/me` (Phase 4).

### T13 — Migration errors and excessive database privileges

**Asset:** Schema integrity, document data, and security controls.

**Threat:** A migration is applied incorrectly, or the application uses broader database privileges than necessary.

**Impact:** Data loss, broken authorization, or bypassed protections.

**Mitigations:**
- Review migrations before applying them.
- Verify migration history and schema state separately.
- Test changes against a disposable database where possible.
- Avoid destructive operations against production.
- Use least-privilege database roles appropriate to the connection model.
- Maintain recovery procedures.

**Verification:** Confirm migration compatibility, inspect actual remote schema state, and test rollback/recovery procedures in a non-production environment.

**Status:** Migration history has been checked; complete remote schema equivalence and least-privilege configuration remain unverified.

## 6. Security Verification Plan

Before considering the security requirements complete, add and execute automated tests for:

1. Missing, invalid, and expired authentication tokens.
2. Cross-user document access attempts.
3. Role restrictions and privilege escalation.
4. Read/edit grants and immediate revocation.
5. Unauthorized document downloads.
6. Private storage access without authorization.
7. Invalid and oversized uploads.
8. Audit events for successful and denied operations.
9. Unauthorized audit-log modification and retrieval.
10. SQL injection resistance for search and filtering.
11. Account disabling and token/session revocation.
12. Migration behavior and database privilege restrictions.

Use separate test identities and isolated test data. Do not run destructive tests against production data.

## 7. Residual Risks and Current Limitations

Based on the current evidence:

- The Phase 2 baseline does not demonstrate a completed authentication system.
- Document-level authorization and permission revocation still require implementation and testing.
- File-upload and download security have not been established.
- The security-hardening migration is pending according to the latest migration-list output.
- The live storage bucket privacy configuration has not been verified.
- Audit-log triggers alone do not prevent all privileged forms of tampering.
- The actual remote database schema has not been fully compared with the intended schema.
- Production deployment and production security configuration remain unverified.

These are explicit follow-up items, not claims that the application is already insecure in every respect.

## 8. Review and Update Policy

Update this threat model whenever a security feature is implemented or changed.

For each mitigation, record:
- The implementation or migration that provides it.
- The test that verifies it.
- The actual test result.
- Remaining limitations.
- A real commit reference when available.

Do not mark a threat as fully mitigated merely because a control has been planned or code has been generated. Verification must support the claim.
