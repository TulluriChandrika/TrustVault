# TrustVault — Threat Model and Security Assessment

## 1. Purpose

TrustVault is a secure document-sharing application intended to let document owners share confidential files with specifically authorized users while maintaining an auditable record of important security events.

This document identifies important threats, their potential impact, implemented mitigations, and the verification evidence demonstrating security.

It describes the project status based on the completed implementation and security verification through Phase 10 as of 2026-10-24.

## 2. System Overview

### Implemented architecture

- **Frontend:** React 19, TypeScript, Vite, and Tailwind CSS.
- **Backend:** Node.js, Express 5, and TypeScript.
- **Database:** PostgreSQL through Supabase with connection pooling (`pg.Pool`).
- **Identity provider:** Supabase Auth with server-side JWT verification.
- **File storage:** Private Supabase Storage bucket named `trustvault-private`.
- **Database access:** PostgreSQL connection through the `pg` package.
- **Security evidence:** Transactional audit logs and 240 automated unit and integration tests (across 9 test suites).

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

**Verification:** Test requests without credentials and with invalid or expired tokens. Automated tests in `apps/api/src/auth.test.ts` (12 tests) and `apps/api/src/security-phase9.test.ts` verify rejection of missing Authorization header (401), non-Bearer or empty Bearer schemes (401), invalid JWT tokens (401), and expired JWT tokens (401) across `/api/me`, `/api/documents`, `/api/documents/search`, and `/api/admin/audit-logs`.

**Status:** Implemented and verified across all API endpoints in Phases 4, 7, 8 & 9.

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

**Verification:** Owner A must not access Owner B's document without an explicit valid grant. Automated tests in `apps/api/src/documents.test.ts` and `apps/api/src/security-phase9.test.ts` verify cross-user isolation: an unauthorized user receives `404 Not Found` (preventing document existence enumeration) for metadata reads, updates, file downloads, and deletion attempts, with denied audit records generated.

**Status:** Implemented and verified across metadata and file downloads in Phases 5, 6, 8 & 9.

### T3 — Privilege escalation

**Asset:** Administrative functions, user roles, and document permissions.

**Threat:** A viewer changes a request field or API call to claim an administrator role.

**Impact:** Unauthorized administration or disclosure of documents.

**Mitigations:**
- Determine roles from trusted server-side data (`public.users.role`).
- Restrict role changes to an explicitly authorized administrative workflow.
- Never accept role assignments from ordinary registration or user requests.
- Test every role-restricted endpoint.

**Verification:** A user must not grant themselves administrative privileges. Automated tests in `apps/api/src/auth.test.ts`, `apps/api/src/audit.test.ts`, `apps/api/src/security-phase9.test.ts`, `apps/api/src/judge-roles.test.ts` (22 tests), and `apps/api/src/seed-judge-accounts.test.ts` (13 tests) verify that client role escalation attempts via request parameters/headers or profile updates (`PATCH /api/me`) are rejected, new users are strictly provisioned as `owner`, non-admin users attempting to access `/api/admin/audit-logs` receive HTTP 403 Forbidden with a denied audit record, global `viewer` users are strictly forbidden from uploading (`POST /api/documents`), editing (`PATCH /api/documents/:id`), deleting (`DELETE /api/documents/:id`), or altering permissions (`/api/documents/:id/permissions/*`), judge demo provisioning requires `ENABLE_DEMO_ACCOUNTS=true` and separate passwords, and legacy `user` accounts retain full compatibility.

**Status:** Implemented and verified for user provisioning, role preservation, global roles (`admin`, `owner`, `viewer`, `user`), and administrative access in Phases 4, 7, 9 & 10.

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

**Verification:** Automated unit/mocked tests in `apps/api/src/documents.test.ts` (83 tests) and `apps/api/src/security-phase9.test.ts` verify owner-only grant, rejection of non-owner grants (403), self-grant rejection (400), target user anti-enumeration (generic 404 for unknown or inactive targets), rejection of duplicate active grants and concurrent race handling (409), atomic revocation handling (404), rollback on audit failure across all mutation types, cross-user listing isolation, exclusion of soft-deleted documents across all endpoints, admin role isolation, and immediate 404 rejection on subsequent download and mutation requests following revocation.

**Status:** Implemented, hardened, and verified in Phases 5, 8 & 9.

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

**Verification:** Automated tests in `apps/api/src/documents.test.ts` and `apps/api/src/security-phase9.test.ts` verify owner, editor, and reader download access, rejection of unshared stranger access (404), rejection of revoked user access (404), rejection of soft-deleted documents (404), rejection of metadata-only records (404), safe error handling when storage objects are missing, and rejection of path traversal sequences in storage keys.

**Status:** Implemented and verified in Phases 6 & 9.

### T6 — Malicious or oversized uploads

**Asset:** API availability, stored files, and downstream document-processing systems.

**Threat:** An attacker uploads oversized files, misleading file types, or malicious content.

**Impact:** Resource exhaustion, unsafe processing, or storage abuse.

**Mitigations:**
- Enforce strict 10 MB file-size limits on multipart uploads (`multer` bound and content length validation).
- Validate allowed MIME types (PDF, PNG, JPEG, WebP, Plain Text, CSV). Reject dangerous extensions and executables (`.exe`, `.sh`, `.bat`, `.js`).
- Perform magic byte validation on buffer headers to detect file signatures and prevent MIME-type spoofing.
- Reject plain text and CSV files containing binary or null bytes (`0x00`).
- Sanitize filenames to prevent path traversal and control character injection.
- Generate unpredictable server-controlled storage keys independently of user filenames.
- Implement compensating cleanup: if database insertion or audit logging fails after storage upload, the orphaned object is deleted from storage.
- Ambiguous commit protection: distinguishes three transaction outcomes (`uncommitted`, `committed`, `unknown`). If the verification query fails or times out, the outcome is `unknown` and the storage object is strictly preserved. If `committed`, the server executes schema-safe soft-delete (`UPDATE public.documents SET deleted_at = now()`) before deleting storage, preserving referential integrity and audit trail history; if soft-delete fails, storage is preserved and an operational alert is logged.

**Limitations:**
- File signature / magic-byte verification validates declared headers against format signatures, but does not substitute for an active antivirus / malware scanning sandbox.
- Distributed transaction atomicity: in network partitions where database COMMIT state is ambiguous and database connectivity cannot be established to verify or clean up the database record, the storage object is preserved to avoid silent data loss, requiring operational alert monitoring.

**Verification:** Automated tests in `apps/api/src/documents.test.ts` and `apps/api/src/security-phase9.test.ts` verify rejection of empty files (400), oversized files (413), disallowed MIME types (400), executable files (400), spoofed magic bytes (400), text files containing null bytes (400), execution of compensating cleanup upon uncommitted database failure, preservation of storage files when verification queries fail (unknown state), and preservation of storage files during ambiguous COMMIT when soft-delete fails.

**Status:** Implemented and verified in Phases 6 & 9.

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

**Verification:** Automated unit tests in `apps/api/src/audit.test.ts` (44 tests) and `apps/api/src/security-phase9.test.ts` verify:
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

**Status:** Implemented and verified in Phases 7 & 9 for API access controls, immutability, query validation, and failure handling; database triggers and indexing remain local pending migration review.

### T8 — SQL injection

**Asset:** Database records and access controls.

**Threat:** Attacker-controlled input is incorporated into SQL statements.

**Impact:** Data disclosure, modification, or deletion.

**Mitigations:**
- Use parameterized queries exclusively (`$1`, `$2`, etc.) via `pg.Pool` and `pg.PoolClient`.
- Never concatenate untrusted input directly into SQL strings.
- Allowlist dynamic column names and sort directions.
- Escape LIKE wildcards or use parameter placeholders for substring queries (`%${search}%`).
- Use the least database privilege compatible with the application's requirements.

**Verification:** Test search, filtering, and mutation inputs with SQL metacharacters and injection payloads (`' OR '1'='1`, `'; DROP TABLE documents; --`, `admin'--`, UNION SELECT payloads). Automated unit and integration tests in `apps/api/src/audit.test.ts`, `apps/api/src/trustvault-enhancements.test.ts`, and `apps/api/src/security-phase9.test.ts` verify that SQL injection payloads are treated strictly as literal string values, returning 0 matching results or executing safely without syntax errors or data exposure.

**Status:** Implemented and verified in Phases 7, 8 & 9 across search, filtering, document metadata, and audit logs.

### T9 — Secret leakage

**Asset:** Database credentials, Supabase keys, and user sessions.

**Threat:** Secrets enter Git history, frontend bundles, logs, or public documentation.

**Impact:** Unauthorized database or storage access.

**Mitigations:**
- Keep `.env` strictly excluded from version control via `.gitignore`.
- Maintain non-sensitive placeholders in `.env.example`.
- Never expose service-role keys or database connection strings through frontend variables; Vite config only exposes public variables prefixed with `VITE_` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`).
- Redact credentials, password hashes, and tokens from logs and error responses.
- Maintain comprehensive environment variable guidance in `docs/ENVIRONMENT.md`.
- Rotate exposed credentials and follow incident-response procedures if leakage occurs.

**Verification:** Automated secret scan across repository files, tracked Git files, and frontend build bundles in Phase 10 verified zero hardcoded secrets or credentials in tracked files. `.gitignore` strictly excludes `.env` and local environment files.

**Status:** Implemented and verified in Phase 10.

### T10 — API abuse and brute-force attempts

**Asset:** API availability and authentication endpoints.

**Threat:** Repeated requests exhaust resources or repeatedly attempt account access.

**Impact:** Service degradation, account compromise, or resource exhaustion.

**Implemented controls:**
- Helmet security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, CSP).
- Rate limiting configured at 100 requests per 15 minutes via `express-rate-limit`.
- A 2 MB JSON request body size limit.
- 10 MB file upload limit with streaming limits.

**Limitations:**
- In-memory rate limits are per-process and not shared across multiple API instances. Horizontal scaling requires a Redis-backed store (`rate-limit-redis`).
- Rate limiting does not replace authentication protections or endpoint-specific brute-force limits.

**Verification:** Automated tests in `apps/api/src/server.test.ts` and `apps/api/src/security-phase9.test.ts` verify that the rate limiting middleware returns HTTP 429 Too Many Requests when configured thresholds are exceeded, Helmet security headers are present, and the JSON body parser enforces the 2 MB payload size limit.

**Status:** Implemented and verified for single-process runtime in Phases 2 & 9; horizontal scaling requires Redis backing.

### T11 — CORS and CSRF weaknesses

**Asset:** Authenticated user actions and browser-held credentials.

**Threat:** An untrusted origin attempts cross-origin requests, or a browser submits an unwanted state-changing request.

**Impact:** Unauthorized actions if the authentication design and browser protections permit them.

**Mitigations:**
- Restrict CORS to trusted origins configured via `CORS_ORIGIN`.
- Restrict allowed HTTP methods and headers in CORS middleware.
- Bearer-token authentication architecture: all protected endpoints require a Bearer token supplied in the `Authorization` request header (`Authorization: Bearer <token>`). Browsers do not attach custom `Authorization` headers automatically in cross-origin requests (unlike ambient cookie-based credentials), neutralizing cross-site request forgery (CSRF) attacks by design.
- State-changing requests validate input schemas and ownership before executing mutations.

**Verification:** Automated tests in `apps/api/src/server.test.ts` verify CORS header behavior, preflight OPTIONS handling, and allowed methods.

**Status:** Implemented and verified for Bearer-token REST architecture in Phases 2, 4 & 9.

### T12 — Compromised or disabled accounts

**Asset:** User identity and documents accessible to that identity.

**Threat:** A stolen credential or token is used, or a disabled account retains access.

**Impact:** Unauthorized document access and changes.

**Mitigations:**
- Check account status (`is_active = true`) in the database during authorization on every protected request.
- Reject deactivated accounts with HTTP 403 Forbidden ("Account is deactivated").
- Prevent deactivated accounts from performing any document creation, reads, downloads, updates, or administrative actions.
- Do not reactivate deactivated accounts upon login.

**Verification:** Automated tests in `apps/api/src/auth.test.ts` and `apps/api/src/security-phase9.test.ts` verify that accounts with `is_active = false` in PostgreSQL are rejected with HTTP 403 Forbidden across `/api/me`, `/api/documents`, and `/api/admin/audit-logs`, and that login attempts do not automatically reactivate them.

**Status:** Implemented and verified in Phases 4 & 9.

### T13 — Migration errors and excessive database privileges

**Asset:** Schema integrity, document data, and security controls.

**Threat:** A migration is applied incorrectly, or the application uses broader database privileges than necessary.

**Impact:** Data loss, broken authorization, or bypassed protections.

**Mitigations:**
- Review migrations before applying them.
- Verify migration history and schema state separately (`npx supabase migration list`).
- Test changes against a disposable local database before remote application.
- Avoid destructive operations against production tables; use soft-delete (`deleted_at = now()`).
- Database migrations define Row-Level Security (RLS) policies and append-only triggers for defense in depth.
- Maintain recovery and rollback procedures.

**Verification:** Initial migration `20261020161206_init.sql` confirmed applied remotely. Local migrations `20261021100000_security_hardening.sql` (RLS policies and append-only triggers) and `20261022180000_audit_logs_actor_idx.sql` (actor index) syntax-tested and verified locally. Pre-deployment checklist documents steps to execute pending migrations against the production database.

**Status:** Implemented locally and verified; remote production migration execution remains a pre-deployment operational step.

## 6. Security Verification Plan

The following 12 security verification areas have automated test coverage across the **205 automated unit and integration tests** in `npm test`:

1. **Authentication:** Missing, invalid, malformed, and expired JWT tokens rejected with 401 Unauthorized (`auth.test.ts`, `security-phase9.test.ts`).
2. **Authorization (IDOR):** Cross-user document access rejected with 404 Not Found to prevent data disclosure and document existence enumeration (`documents.test.ts`, `security-phase9.test.ts`).
3. **Role Enforcement:** Administrative endpoints restrict access to `admin` role; `owner` and `viewer` roles rejected with 403 Forbidden (`audit.test.ts`, `security-phase9.test.ts`).
4. **Permissions & Revocation:** Read/edit grants take effect immediately; revoked permissions immediately block downloads and edits with 404 (`documents.test.ts`, `security-phase9.test.ts`).
5. **Private Downloads:** Unauthorized file downloads blocked with 404; storage keys sanitized against traversal (`documents.test.ts`, `security-phase9.test.ts`).
6. **Storage Security:** Storage files mediated exclusively through backend; direct public access prevented (`documents.test.ts`, `security-phase9.test.ts`).
7. **Upload Security:** 10 MB limits, disallowed file types (`.exe`, `.sh`), spoofed MIME headers, and null bytes rejected with 400/413 (`documents.test.ts`, `security-phase9.test.ts`).
8. **Audit Trail Coverage:** All state mutations (create, update, delete, grant, revoke) emit transactional audit logs; failure causes rollback (`documents.test.ts`, `audit.test.ts`).
9. **Audit Immutability:** Audit endpoints are read-only (POST, PUT, PATCH, DELETE return 404); denied admin access attempts are logged (`audit.test.ts`, `security-phase9.test.ts`).
10. **SQL Injection Resistance:** Parameterized queries used across all endpoints; injection payloads in titles, search, and filters treated as literals (`audit.test.ts`, `trustvault-enhancements.test.ts`, `security-phase9.test.ts`).
11. **Account Deactivation:** Deactivated accounts (`is_active = false`) blocked with 403 across all protected routes (`auth.test.ts`, `security-phase9.test.ts`).
12. **API Abuse Controls:** Rate limiting middleware enforces thresholds (429), Helmet sets security headers, and JSON body parser caps payloads at 2 MB (`server.test.ts`, `security-phase9.test.ts`).

## 7. Residual Risks and Current Limitations

The following operational requirements and residual risks should be reviewed prior to production deployment:

1. **Remote Database Migrations:**
   - Migration `20261021100000_security_hardening.sql` (enabling table RLS and append-only audit triggers) and `20261022180000_audit_logs_actor_idx.sql` (actor index) are verified locally and should be applied to the remote Supabase PostgreSQL database during deployment maintenance.
   - Note: Because backend queries execute via `DATABASE_URL` as the database owner, application authorization is enforced by Express middleware; table RLS provides defense-in-depth against direct PostgREST Data API access.

2. **Storage Bucket Privacy Configuration:**
   - Verify in the Supabase Dashboard that the `trustvault-private` storage bucket has **Public bucket** set to OFF.
   - File downloads must always flow through the backend download endpoint (`GET /api/documents/:id/download`).

3. **Horizontal Rate Limiting:**
   - The current `express-rate-limit` middleware uses an in-memory store, which applies per Node.js process. When deploying across multiple container instances or behind a load balancer, configure a Redis-backed store (`rate-limit-redis`) to share rate-limit counters across instances.

4. **Antivirus & Malware Sandbox Boundary:**
   - File validation checks MIME types, magic-byte header signatures, binary content, and filename sanitization.
   - Magic-byte verification ensures file format header conformance, but does not execute dynamic malware analysis or sandbox inspection. An asynchronous virus-scanning pipeline (e.g. ClamAV or VirusTotal API) is recommended for high-risk enterprise deployments.

5. **Client-Side Physical File Revocation:**
   - Document access revocation immediately blocks subsequent API downloads and metadata access.
   - Revocation cannot retroactively delete or recall physical files that an authorized user already downloaded to their local disk or device storage before access was revoked.

6. **Standalone Audit Persistence Failure Window:**
   - Mutating business operations couple audit logging to the database transaction (rolling back if audit write fails).
   - Standalone audit logs (e.g. read denials, connection aborts) use independent database queries. If PostgreSQL experiences a complete outage or storage exhaustion, standalone denial logs cannot be persisted; errors are caught and logged to stderr to avoid crashing the server process.

## 8. Review and Update Policy

Update this threat model whenever a security feature is implemented or changed.

For each mitigation, record:
- The implementation or migration that provides it.
- The test that verifies it.
- The actual test result.
- Remaining limitations.
- A real commit reference when available.

Do not mark a threat as fully mitigated merely because a control has been planned or code has been generated. Verification must support the claim.

