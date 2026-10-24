# AI Assistance and Development Log — TrustVault

## Purpose

This document records the use of AI assistance during TrustVault development for the SNOVASYS Hackathon. AI is used to assist with planning, implementation, code review, debugging, security analysis, testing, and documentation.

The developer remains responsible for reviewing generated changes, understanding the implementation, verifying test results, and making development decisions.

**Accuracy note:** Entries below summarize work and review activities supported by the available project history. They are not claimed to be verbatim prompts. Add exact prompts, dates, test evidence, and commit references only when verified.

---

## Entry 1 — Project Planning and Architecture

**Date:** 2026-10-19
**Task:** Establish the implementation approach for TrustVault.

**Prompt summary:** Develop a phased implementation plan for a secure document-sharing application using React, Node.js/Express, PostgreSQL, and private object storage. Respect the hackathon's individual-assessment requirements.

**AI assistance:**
- Organized development into incremental phases.
- Identified authentication, authorization, document permissions, audit logging, storage security, testing, and documentation as major areas.
- Recommended reviewing existing work before implementing new features.

**Developer review and decisions:**
- Retained the existing project and repository.
- Chose an incremental development process.
- Kept implementation and security decisions subject to personal review and testing.

**Outcome:** A phased development workflow was established.

**Verification:** Planning activity only; no software test is claimed for this entry.

**Commit reference:** Add a real commit hash if applicable.

---

## Entry 2 — Repository and Migration Review

**Date:** 2026-10-21
**Task:** Inspect the existing repository and derive the database schema from its SQL migrations.

**Prompt summary:** Inspect the actual project files and SQL migration history, identify the existing schema, and report security issues without modifying the database.

**AI assistance:**
- Reviewed the initial schema migration and the security-hardening migration.
- Summarized the `users`, `documents`, `document_permissions`, `audit_logs`, and `sessions` tables.
- Identified the RLS policies, audit-log triggers, and `updated_at` trigger defined in the second migration.

**Issues identified during review:**
- The `users` table contains a `password_hash` column even though Supabase Auth is the intended identity provider.
- Row-level audit-log triggers do not by themselves prevent `TRUNCATE`.
- The remote database schema was not independently proven to match every migration statement.

**Developer review and decisions:**
- Checked migration status using `npx supabase migration list`.
- Confirmed that migration `20261020161206` was recorded as applied remotely.
- Confirmed that migration `20261021100000` was present locally but not recorded as applied remotely at the time of the check.
- Kept remote migration application subject to review.

**Outcome:** Migration history and several database-security concerns were documented.

**Verification:** Migration-list output was inspected. This does not prove that every remote database object matches the SQL files.

**Commit reference:** Add a real commit hash if applicable.

---

## Entry 3 — Development Environment and Workspace Configuration

**Date:** 2026-10-21
**Task:** Stabilize the existing npm workspaces, frontend, backend, and TypeScript configuration.

**Prompt summary:** Inspect the existing project and make minimal changes to establish a reliable development baseline without rebuilding the application.

**AI assistance:**
- Organized root scripts for development, build, test, type checking, and database connectivity.
- Configured the API workspace for TypeScript and native Node.js ESM.
- Initialized the React, TypeScript, and Vite frontend baseline.
- Updated dependency declarations and the npm lockfile.

**Developer review:**
- Inspected the reported modified and untracked files.
- Reviewed Git status and whitespace-check output.
- Preserved the existing initial Git commit.

**Verification reported by the development agent:**
- Backend and frontend type checks passed.
- Backend and frontend builds passed.
- Ten API tests passed.
- The development API health endpoint responded successfully.
- The read-only PostgreSQL connection test succeeded.

These results were reported by the development agent and should be retained with the corresponding test output if required for assessment.

**Outcome:** A working development baseline was reported.

**Commit reference:** Add the actual commit hash after committing the reviewed changes.

---

## Entry 4 — API Baseline Security Review

**Date:** 2026-10-21
**Task:** Review the Express API baseline and its automated tests.

**Prompt summary:** Establish a reliable API health endpoint, configure basic security middleware, handle errors safely, and verify behavior through automated HTTP tests.

**AI assistance:**
- Configured Helmet security headers.
- Added restricted CORS handling.
- Added rate limiting and a JSON request-body size limit.
- Added predictable health and 404 responses.
- Added safe error handling and graceful shutdown behavior.
- Added Vitest and Supertest coverage for baseline API behavior.

**Review considerations:**
- CORS is not a replacement for authentication or authorization.
- In-memory rate limiting is not shared between multiple API instances.
- Proxy trust must match the actual deployment topology.
- The health endpoint's database-degradation behavior should be appropriate for its intended use.

**Verification reported by the development agent:** Ten tests passed, covering security headers, CORS, payload handling, routing, and database-degradation behavior.

**Outcome:** The baseline API behavior was tested according to the reported results.

**Limitations:** These tests do not establish that document-level authorization, permission revocation, or the complete audit trail has been implemented.

**Commit reference:** Add a real commit hash if applicable.

---

## Entry 5 — Documentation and Commit Review

**Date:** 2026-10-21
**Task:** Prepare the project documentation and separate development-baseline changes from database migration changes.

**Prompt summary:** Review the implementation results, migration status, and Git changes before committing.

**AI assistance:**
- Reviewed the README's migration-status descriptions.
- Recommended separating development-environment changes from database-security migration work.
- Identified the need for accurate threat-model documentation and an honest AI-assistance log.

**Developer review and decisions:**
- Inspected `git status --short`, `git diff --check`, and the available diff output.
- Reviewed the local and remote migration-list output.
- Deferred committing until the relevant changes and documentation had been reviewed.

**Outcome:** A commit-review strategy was prepared.

**Verification:** The migration-list output showed the initial migration recorded remotely and the security-hardening migration pending at the time of inspection.

**Commit reference:** Commit `37a8300` (Phase 2).

---

## Entry 6 — Database Migration Baseline and Schema Integrity (Phase 3)

**Date:** 2026-10-21
**Task:** Verify live remote schema against SQL migrations, audit connection privileges, and harden audit-log controls.

**Prompt summary:** Perform read-only verification of local vs remote migration history and database catalogs; evaluate Supabase Auth compatibility, RLS privileges, and audit-log triggers.

**AI assistance:**
- Queried remote `information_schema` and `pg_catalog` to confirm all 5 tables (`users`, `documents`, `document_permissions`, `audit_logs`, `sessions`) match Migration 1.
- Confirmed that Migration 2 (`20261021100000`) is pending remotely, with 0 triggers and 0 RLS policies currently on remote tables.
- Discovered that the Express backend's direct connection (`DATABASE_URL`) connects as user `postgres` with `usebypassrls: true`, meaning RLS does not govern backend queries.
- Identified that row-level triggers do not intercept `TRUNCATE`, and updated `20261021100000_security_hardening.sql` with a statement-level `BEFORE TRUNCATE` trigger.
- Corrected architectural comments in the migration and `README.md`.

**Developer review and decisions:**
- Confirmed migration list (`20261020161206` applied, `20261021100000` pending).
- Decided to keep `public.users.password_hash NOT NULL` unchanged for Phase 3 and defer Supabase Auth reconciliation to Phase 4.
- Approved adding the `BEFORE TRUNCATE` trigger to `20261021100000_security_hardening.sql`.
- Withheld remote migration push (`npx supabase db push`) until Phase 3 review is complete.

**Verification:**
- Live read-only schema queries confirmed exact match with Migration 1.
- `git diff --check` passed on migration and documentation files.
- `npm run check` and `npm run db:check` passed cleanly.

**Outcome:** Verified database baseline and prepared hardened security migration.

**Commit reference:** Add a real commit hash after committing Phase 3 changes.

---

## Entry 7 — Authentication and User-Schema Alignment (Phase 4)

**Date:** 2026-10-21
**Task:** Implement Supabase Auth authentication, idempotent user provisioning, role protection, deactivated user enforcement, `/api/me` endpoint, frontend auth flow, and automated test suite.

**Prompt summary:** Implement Phase 4 using Supabase Auth as sole password authentication; validate Bearer tokens in Express using `supabaseAdmin.auth.getUser()`; map verified Supabase UUID to `public.users.id`; prepare local migration for `password_hash`; implement idempotent user provisioning preserving roles and `is_active`; reject inactive accounts; expose `/api/me`; build frontend auth UI; add automated tests for all token and user states.

**AI assistance:**
- Prepared local migration `supabase/migrations/20261021183000_align_users_supabase_auth.sql` to drop `NOT NULL` on `public.users.password_hash` with default `NULL`.
- Created `apps/api/src/supabase.ts` for service-role Supabase client management and mock injection in unit tests.
- Created `apps/api/src/middleware/auth.ts` implementing `requireAuth`: extracts Bearer token, verifies via Supabase Auth, idempotently provisions user into `public.users` via `INSERT ... ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email RETURNING ...`, and blocks inactive accounts (`is_active = false`) with HTTP 403.
- Created `apps/api/src/routes/auth.ts` and mounted `/api/me` and `/api/auth/me`, returning strictly safe user fields.
- Implemented frontend client `apps/web/src/lib/supabase.ts` and UI in `apps/web/src/App.tsx` (Sign Up, Sign In, Sign Out, session state listener, and interactive `/api/me` verification).
- Added comprehensive automated test suite `apps/api/src/auth.test.ts` covering missing token, malformed format, invalid signature, expired token, new user provisioning, inactive account rejection, valid user retrieval, role escalation attempt rejection, and secret omission.

**Developer review and decisions:**
- Approved using verified Supabase Auth UUID as `public.users.id`.
- Mandated that client-submitted roles are never accepted and existing roles are never modified during login/provisioning.
- Mandated that deactivated accounts cannot be reactivated by logging in.
- Mandated that `password_hash` remains strictly unexposed in API payloads.
- Verified that local migration is prepared but NOT applied remotely until reviewed.

**Verification:**
- `npm run typecheck`: Passed cleanly with 0 TypeScript errors across `apps/api` and `apps/web`.
- `npm run build`: Passed cleanly, producing `apps/api/dist` and `apps/web/dist` production bundles.
- `npm run test`: Passed cleanly — 20 out of 20 tests passed across `src/server.test.ts` and `src/auth.test.ts`.
- `npm run db:check`: Confirmed active database connection to Supabase PostgreSQL.

**Outcome:** Phase 4 fully implemented, tested, and documented.

**Commit reference:** Commit `8f1da25` (`feat(auth): implement Supabase authentication`).

---

## Entry 8 — Document and Permission Engine (Phase 5)

**Date:** 2026-10-21
**Task:** Implement server-side document authorization, metadata CRUD, permission grants/revocation, transactional audit logging, and security test suite.

**Prompt summary:** Implement Phase 5 document and permission engine on Express backend; enforce server-side authorization on every operation; support metadata CRUD without client-specified `storage_key` or `owner_id`; reject duplicate active permission grants with 409 Conflict; enforce owner-only grant/revoke; support read/edit hierarchy; record audit events inside transactions with rollback on failure; add automated security tests covering cross-user isolation, denied mutations, and audit consistency.

**AI assistance:**
- Inspected database schema from migrations 1, 2, and 3, confirming no schema migration is needed for Phase 5.
- Created `apps/api/src/utils/validation.ts` for RFC 4122 UUID and string sanitization.
- Created `apps/api/src/audit.ts` supporting transactional audit recording inside SQL transactions (with full rollback on audit write failure) and standalone logging for denied requests.
- Created `apps/api/src/routes/documents.ts` implementing `GET /api/documents`, `POST /api/documents`, `GET /api/documents/:id`, `PATCH /api/documents/:id`, `DELETE /api/documents/:id`, `GET /api/documents/:id/permissions`, `POST /api/documents/:id/permissions`, and `DELETE /api/documents/:id/permissions/:userId`.
- Mounted documents router at `/api/documents` in `apps/api/src/server.ts`.
- Created comprehensive test suite in `apps/api/src/documents.test.ts` with 16 automated security tests.

**Developer review and decisions:**
- Approved schema inspection and pre-implementation architecture report.
- Mandated that clients can never choose `storage_key` (generated server-side) and that file upload/storage belongs to Phase 6.
- Mandated that duplicate active grants are rejected with `409 Conflict` rather than silent permission mutation.
- Mandated that transactional mutations must roll back if audit log insertion fails.
- Mandated that non-owners cannot delete documents or manage permissions, and that revoked users immediately receive 404 on subsequent requests.

**Verification:**
- `npm run typecheck`: Passed with 0 errors across `@trustvault/api` and `@trustvault/web`.
- `npm run build`: Passed cleanly for both API and client packages.
- `npm run test`: All 38 tests passed across `auth.test.ts` (12), `server.test.ts` (10), and `documents.test.ts` (16).
- `npm run db:check`: Confirmed active database connection to Supabase PostgreSQL.

**Outcome:** Phase 5 fully implemented, verified, and documented.

**Commit reference:** Add a real commit hash after committing Phase 5 changes.

---

## Entry 9 — Phase 5 Security Review and Concurrency Hardening

**Date:** 2026-10-22
**Task:** Conduct a formal security review and hardening of the Phase 5 Document and Permission Engine.

**Prompt summary:** Review and harden Phase 5 implementation against cross-user isolation bypasses, TOCTOU race conditions in mutations, concurrent grant collisions on the partial unique index, self-grants, silent revocation failures, audit reliability, and missing test coverage without modifying the remote database or starting Phase 6.

**AI assistance:**
- Conducted an in-depth security inspection of `routes/documents.ts`, `audit.ts`, `validation.ts`, and migrations.
- Identified and fixed an unhandled 500 error on concurrent grant collision by catching PostgreSQL unique constraint violation `code 23505` and mapping it to `409 Conflict`.
- Hardened `PATCH /api/documents/:id` against TOCTOU authorization races by moving permission verification into an atomic conditional SQL update query (`WHERE ... AND (owner_id = $4 OR EXISTS (SELECT 1 FROM document_permissions WHERE permission = 'edit' AND revoked_at IS NULL))`), rolling back and returning 403 if permission was revoked before the update executed.
- Hardened `DELETE /api/documents/:id` to atomically check ownership and non-deleted status in the SQL update.
- Hardened `DELETE /api/documents/:id/permissions/:userId` to verify `result.rows.length === 0` on the transactional UPDATE, returning 404 rather than committing false success on repeated or concurrent revocation.
- Added explicit self-grant prevention (`targetUser.id === userId || targetUser.id === doc.owner_id`) returning `400 Bad Request` with denied audit logging.
- Added denied audit logging to `GET /api/documents/:id/permissions` when a document is unshared or not found, establishing consistent audit trail behavior.
- Hardened `POST /api/documents/:id/permissions` against user account enumeration: combined non-existent and inactive target checks into a single generic `404 Not Found` response ("Target user not found or not eligible") with denied audit logging (`reason: "target_not_found_or_inactive"`).
- Expanded `apps/api/src/documents.test.ts` from 16 to 30 automated tests (+14 new security tests).

**Developer review and decisions:**
- Confirmed that table RLS does not apply to Express backend queries using the `postgres` BYPASSRLS role; verified that Express-level authorization is strictly required on every operation.
- Validated atomic conditional SQL updates to eliminate in-flight mutation races.
- Ensured that denied requests never become authorized due to audit logging issues, and verified that all mutating operations roll back if audit log persistence fails.
- Explicitly documented the exact concurrency boundary for in-flight requests versus requests following committed revocations.
- Approved anti-enumeration hardening to prevent leaking user existence and account activation status.

**Verification:**
- `npm run check`: Exited with code `0`.
  - Typecheck: passed across `@trustvault/api` and `@trustvault/web`.
  - Production build: passed across `@trustvault/api` and `@trustvault/web`.
  - Automated tests: 52 total tests passed (12 auth tests, 10 server tests, 30 document tests).
  - Test framework: Vitest with Supertest using in-memory mock isolation. (Unit/mocked tests; no real PostgreSQL integration tests were executed).

**Outcome:** Phase 5 security review and hardening completed, verified, and documented.

**Commit reference:** Add a real commit hash after committing Phase 5 hardening.

---

## Entry 10 — Phase 6: Secure Document Lifecycle Implementation

**Date:** 2026-10-22
**Task:** Implement Phase 6 Secure Document Lifecycle: server-side file validation, private Supabase Storage integration, cross-system transactional metadata/audit persistence with compensating object cleanup, and backend-mediated authorized streaming downloads.

**Prompt summary:** Implement multipart file upload and backend-mediated streaming download according to the Phase 6 inspection report and requirements: enforce 10MB limit during multipart parsing; validate MIME type and magic bytes (reject null bytes in TXT/CSV); use server-generated storage keys in private bucket; execute storage upload before DB transaction, compensating with storage object deletion if DB/audit insert fails; distinguish metadata-only records (`raw/...`) from file uploads and block download attempts; enforce download authorization on every request; add comprehensive security tests; do not run Git commands, read secrets, or start Phase 7/8.

**AI assistance:**
- Added `multer` memory storage configured with a strict 10MB limit (`limits: { fileSize: 10 * 1024 * 1024 }`) and error handling for `LIMIT_FILE_SIZE` returning `413 Payload Too Large`.
- Implemented `validateFileContent` in `apps/api/src/utils/validation.ts` validating MIME types against `ALLOWED_MIME_TYPES` (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `text/plain`, `text/csv`), verifying binary magic-byte signatures for PDF, PNG, JPEG, and WebP, checking text/CSV files for UTF-8 and rejecting binary null bytes (`0x00`), and sanitizing filenames with `sanitizeFilename`.
- Updated `POST /api/documents` in `apps/api/src/routes/documents.ts`:
  - When a file is uploaded via `multipart/form-data`, file content is validated, a server-controlled key `private/${userId}/${uuid}.${ext}` is generated, and the file is uploaded to the private bucket `trustvault-private` via `getSupabaseAdmin().storage.from(...)`.
  - Database metadata insertion and `file:upload` audit log insertion are executed atomically in a PostgreSQL transaction (`BEGIN ... COMMIT`).
  - If database metadata or audit logging insertion fails, the transaction rolls back (`ROLLBACK`) and compensating cleanup immediately deletes the uploaded object from storage via `supabaseAdmin.storage.from(bucket).remove([storageKey])`.
  - Preserved Phase 5 metadata-only JSON creation for compatibility, tagging such records with a `raw/${uuid}` storage key prefix.
- Implemented `GET /api/documents/:id/download` in `apps/api/src/routes/documents.ts`:
  - Enforces access authorization on every download request (owner, active editor, or active reader).
  - Rejects metadata-only records (`storage_key.startsWith("raw/")`) with `404 Not Found` ("Document has no associated file content").
  - Rejects soft-deleted documents with `404 Not Found`.
  - Streams document bytes directly through Express using safe response headers: `Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: attachment; filename="<sanitized_title>"`.
  - Audits successful downloads (`file:download`, `success`) and unauthorized/unauthenticated download attempts (`file:download`, `denied`).
- Expanded `apps/api/src/documents.test.ts` from 30 to 67 tests (+37 new Phase 6 tests), covering upload validation, multipart file presence requirement, multipart field count/value size limits, single-file restriction, oversized files (413), magic byte spoofing, binary null bytes in text files, storage upload failure (500), compensating storage deletion on DB/audit failure, compensating cleanup on pool acquisition failure and rollback error, standalone failure audit logging, download authorization for owner/editor/reader, download denial for stranger/revoked/deleted/metadata-only documents, non-private storage key rejection, missing storage objects, download completion/interruption tracking, deduplicated download audits, error handling on audit failure, RFC 6266 Content-Disposition headers (Unicode, quotes, semicolons, percent, CR/LF injection), path normalization across POSIX/Windows/traversal paths, and pure PDF ArrayBuffer fixtures.
- Updated `THREATS.md` (T5 and T6 marked as implemented and verified in Phase 6) and `README.md` (documented new endpoints, validation rules, storage architecture, compensating transactions, and known limitations).

**Developer review and decisions:**
- Prevented metadata-only records from being downloaded as files without requiring a database migration by prefixing metadata-only records with `raw/` and rejecting downloads for keys that do not belong to `private/`.
- Enforced strict multipart parsing limits: max 1 file, max 10 fields, max 20 parts, max 64KB field size, returning 413 for size limits and 400 for structure violations.
- Guaranteed compensating storage cleanup runs on every post-upload failure path, including database connection acquisition failure (`pool.connect()`), transaction execution errors, and even if transactional `ROLLBACK` throws.
- Implemented RFC 6266 and RFC 5987 compliant `Content-Disposition` header with both ASCII fallback and UTF-8 percent-encoded `filename*`, stripping CR/LF to prevent HTTP response splitting.
- Normalized path separators before constructing download headers: implemented `normalizeFilename()` to strip drive letters, directory paths, and path separators (`/` and `\`) before generating both the ASCII fallback and RFC 5987 percent-encoded UTF-8 `filename*`.
- Fixed fire-and-forget download audit calls: attached `.catch(...)` error handlers to prevent unhandled promise rejections, implemented an in-memory lifecycle guard (`downloadAuditRecorded`) to ensure the application initiates at most one audit attempt per request (avoiding duplicate attempts when both `finish` and `close` occur), clarified that successful persistence in PostgreSQL cannot be guaranteed if the database fails, and documented that `finish` establishes completion of server response streaming rather than client disk persistence.
- Corrected test fixtures to return clean, valid PDF ArrayBuffer slices.
- Explicitly documented that all tests in the suite are in-memory unit tests using mocks and that production readiness requires live end-to-end integration testing against real Supabase infrastructure.

**Verification:**
- `npm run check`: Exited with code `0`.
  - Typecheck: passed across `@trustvault/api` and `@trustvault/web`.
  - Production build: passed across `@trustvault/api` and `@trustvault/web`.
  - Automated tests: 89 total tests passed (12 auth tests, 10 server tests, 67 document tests).
  - Test framework: Vitest with Supertest using in-memory mock isolation. All storage and database client interactions in the test suite are mocked unit tests; no real PostgreSQL integration tests were executed.

**Outcome:** Phase 6 fully reviewed, hardened against CodeRabbit findings, verified, and documented.

**Commit reference:** Add a real commit hash after committing Phase 6 changes.

---

## Entry 11 — Phase 6: Filename Validation Hardening (Edge Cleanup & Unicode Truncation)

**Date:** 2026-10-22
**Task:** Address CodeRabbit review findings regarding edge dot/whitespace normalization and Unicode-safe filename truncation in `apps/api/src/utils/validation.ts`.

**Prompt summary:**
1. Remove edge dots and whitespace in one step:
   - Normalize path separators and remove path components before building either filename representation.
   - Apply edge cleanup so leading and trailing dots and whitespace are removed together in a single operation, preventing alternating dot/space patterns (e.g. ` .report. `, ` . .report. . `) from leaving exposed edge dots or whitespace.
   - Provide a safe fallback (`download`) when normalization produces an empty string.
   - Maintain RFC 6266 `Content-Disposition` behavior with safe ASCII fallback and UTF-8 `filename*`.
2. Truncate without splitting Unicode characters:
   - Replace UTF-16 code-unit slicing with grapheme-aware truncation using `Intl.Segmenter` (with code-point fallback).
   - Ensure multi-byte surrogate pairs and combining characters are never bisected into invalid surrogate halves or replacement characters.
   - Apply truncation consistently before building headers and re-clean edge dots/whitespace if truncation cuts on an edge character.
   - Use `/u` flag for non-ASCII regex replacement in ASCII fallback construction so surrogate pairs map to a single underscore.
   - Add regression tests covering edge dots, whitespace, mixed combinations, surrogate pairs, combining marks, and truncation boundaries.

**AI assistance:**
- Implemented `truncateUnicode(str, maxGraphemes = 150)` in `apps/api/src/utils/validation.ts` using `Intl.Segmenter` (`granularity: "grapheme"`) to count and truncate whole graphemes, preserving multi-byte surrogate pairs (e.g. emoji `🎉`) and combining marks (`e\u0301`). Included code-point iterator fallback for runtimes without `Intl.Segmenter`.
- Refactored `normalizeFilename()`:
  - Combined leading and trailing dots and whitespace cleanup into a single regex operation: `replace(/^[\s.]+|[\s.]+$/g, "")`.
  - Replaced path components (`^.*[\\/]`) and remaining separators (`[\\/]`) with underscores, and stripped non-printable control characters (`[\x00-\x1f\x7f]`).
  - Added truncation via `truncateUnicode()` to at most 150 graphemes, followed by re-application of single-step edge cleanup in case truncation cut at a dot or space.
  - Implemented safe fallback to `"download"` if the result is empty or whitespace/dots only.
- Updated `sanitizeFilename()` to use `normalizeFilename()` and single-step edge cleaning with `"download"` fallback.
- Updated `buildContentDisposition()`:
  - Applied `/[^\x20-\x7e]/gu` (Unicode mode) and `["\\;=]` character replacement for ASCII `filename` fallback with single-step edge cleanup and `"download"` fallback.
  - Formatted RFC 5987 UTF-8 `filename*` using percent-encoding on the normalized, grapheme-truncated filename.
- Added 5 regression tests (Tests 60–64) in `apps/api/src/documents.test.ts`:
  - Test 60: Removes edge dots and whitespace in one step (` . .report. . ` -> `report`).
  - Test 61: Falls back to `"download"` when title consists only of whitespace and dots (`   . . .   `).
  - Test 62: Truncates long filenames cleanly without splitting surrogate pairs (149 ASCII + `🎉` + overflow text).
  - Test 63: Preserves combining characters (`e\u0301`) as intact grapheme clusters during truncation.
  - Test 64: Cleans trailing dots if truncation cuts immediately after a period.

**Developer review and decisions:**
- Confirmed Finding 1: Separate trimming and dot stripping previously left exposed dots when spaces preceded or followed them. Combined regex `replace(/^[\s.]+|[\s.]+$/g, "")` cleans both simultaneously.
- Confirmed Finding 2: Standard `.slice()` sliced UTF-16 code units, risking bisection of surrogate pairs. Used native Node.js `Intl.Segmenter` for grapheme-cluster awareness. Also fixed ASCII fallback regex to include `/u` flag so surrogate pairs produce a single replacement character (`_`) rather than two (`__`).
- Documented that while grapheme truncation guarantees valid Unicode and header injection safety, external filesystems and client OSes have varying path-length limits.

**Verification:**
- `npm run check`: Exited with code `0`.
  - Typecheck: passed across `@trustvault/api` and `@trustvault/web`.
  - Production build: passed across `@trustvault/api` and `@trustvault/web`.
  - Automated tests: 94 total tests passed (12 auth tests, 10 server tests, 72 document tests).
  - Vitest test suite runs in-memory with mocked storage and database clients.

**Outcome:** All filename validation and Unicode truncation issues fixed and verified.

**Commit reference:** Add a real commit hash after committing Phase 6 changes.

---

## Entry 12 — Phase 6: Final Completion Review & CodeRabbit Remediation

**Date:** 2026-10-22
**Task:** Resolve three outstanding CodeRabbit findings in Phase 6:
1. Verify compensating DELETE against the real repository schema: replaced hard `DELETE` with schema-safe soft-delete (`UPDATE public.documents SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`) to preserve referential integrity and audit trail traceability.
2. Preserve storage object during ambiguous COMMIT when the verification query itself fails: implemented 3-state reconciliation (`uncommitted`, `committed`, `unknown`), guaranteeing storage objects are preserved whenever the transaction outcome cannot be conclusively established (`unknown`) or soft-delete fails.
3. Enforce Content-Disposition header limits when one grapheme is too large: accumulated graphemes individually against `MAX_ENCODED_FILENAME_LEN = 800` and implemented safe fallback to `"download"` when a single grapheme cluster exceeds the budget or the header exceeds `MAX_CONTENT_DISPOSITION_LEN = 2000`.

**AI assistance:**
- Updated `apps/api/src/routes/documents.ts`:
  - Structured ambiguous COMMIT recovery into three distinct outcomes: `uncommitted`, `committed`, and `unknown`.
  - When outcome is `unknown` (e.g. verification query fails, times out, or disconnects), the storage object is strictly preserved and an operational alert is logged.
  - When outcome is `committed`, executes schema-safe soft-delete (`UPDATE public.documents SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`). If soft-delete succeeds, storage cleanup proceeds; if soft-delete fails, the storage object is preserved.
  - When outcome is `uncommitted` (e.g. verification query confirms 0 rows or insert never returned an ID), storage cleanup safely deletes the orphaned storage object.
- Updated `apps/api/src/utils/validation.ts`:
  - Defined `MAX_ENCODED_FILENAME_LEN = 800` and `MAX_CONTENT_DISPOSITION_LEN = 2000`.
  - Replaced arbitrary stepping with grapheme-cluster-by-grapheme-cluster accumulation.
  - Added fallback to `"download"` if a single grapheme cluster exceeds the entire budget.
  - Added invariant check ensuring the total `Content-Disposition` header never exceeds `MAX_CONTENT_DISPOSITION_LEN`.
- Added/updated regression tests (Tests 65–75) in `apps/api/src/documents.test.ts`:
  - Test 65: Preserves storage file during ambiguous COMMIT if database record exists and soft-delete fails.
  - Test 66: Cleans up storage file during ambiguous COMMIT when committed DB record is successfully soft-deleted.
  - Test 67: Caps Content-Disposition total encoded length safely under 2KB for titles with heavy multi-byte graphemes.
  - Test 68: Preserves storage file when the commit verification query itself fails (`unknown` state).
  - Test 69: Preserves storage file when COMMIT failed even if verification query returns zero rows (zero rows do not prove uncommitted when COMMIT failed).
  - Test 70: Preserves storage file when ROLLBACK failed even if verification query returns zero rows.
  - Test 71: Cleans up storage file only when supported by reliable evidence (error before COMMIT + clean ROLLBACK + zero rows).
  - Test 72: Releases transaction client BEFORE running reconciliation queries on the pool (preventing pool starvation/deadlocks).
  - Test 73: Discards transaction client from the pool with error argument when transaction or rollback fails.
  - Test 74: Falls back to `"download"` when a single grapheme cluster exceeds the length budget.
  - Test 75: Preserves complex joined emoji sequences (ZWJ) without splitting surrogate pairs or exceeding limit.
- Updated `README.md` and `THREATS.md` to reflect 3-state reconciliation, client release before reconciliation, soft-delete, and grapheme limits.

**Developer review and decisions:**
- Confirmed Finding 1: Transaction client was previously held during subsequent `pool.query()` reconciliation calls, which could cause pool exhaustion/deadlock in limited pools. Also, failed connections were not being discarded. Fixed by releasing or discarding the client connection before initiating pool queries, and passing the failure error to `client.release(err)` to discard broken sockets.
- Confirmed Finding 2: A zero-row query result was previously treated as proof of an uncommitted transaction even if COMMIT had failed or ROLLBACK had thrown. Fixed by classifying zero rows as `unknown` whenever COMMIT was attempted or ROLLBACK failed, preserving storage for manual review. Conclusive uncommitted state requires either no insert ID or clean pre-commit rollback.
- Confirmed Finding 3: Stepping by -15 could fail if a single grapheme cluster exceeded the budget. Fixed by accumulating whole graphemes up to `MAX_ENCODED_FILENAME_LEN = 800` and falling back cleanly to `"download"`.

**Verification:**
- `npm run check`: Exited with code `0`.
  - Typecheck: passed across `@trustvault/api` and `@trustvault/web`.
  - Production build: passed across `@trustvault/api` and `@trustvault/web`.
  - Automated tests: **105 total tests passed** (12 auth tests, 10 server tests, 83 document tests).
  - All storage and database client interactions in tests are strictly mocked unit tests.

**Outcome:** All CodeRabbit review findings fully resolved, tested, and verified.

**Commit reference:** Committed in `94e66cf` (`feat: complete secure document lifecycle`).

---

## Entry 13 — Phase 7: Audit Trail Integrity and Administrative Audit APIs

**Date:** 2026-10-22
**Task:** Implement Phase 7: Audit Trail Integrity and Administrative Audit APIs:
1. Enforce strict administrative access control on administrative endpoints.
2. Provide list and detail endpoints for audit logs with validated pagination, multi-attribute filtering, and parameterized SQL.
3. Ensure immutability of audit records at application and database layers.
4. Distinguish transactional audit logging from standalone audit logging and document persistence failure boundaries.
5. Create local indexing migration for query performance without applying remotely.
6. Add comprehensive automated tests and update security documentation.

**AI assistance:**
- Created `apps/api/src/middleware/admin.ts`:
  - Enforces `req.user.role === 'admin'` from verified server-side user record.
  - Ignores client-supplied role claims (headers, body, query).
  - Emits standalone denied audit log (`action: "audit_log:read"`, `outcome: "denied"`) when non-admins attempt access.
  - Traps audit write failures safely to prevent crashing or recursive logging.
- Created `apps/api/src/routes/adminAudit.ts`:
  - `GET /api/admin/audit-logs`: supports bounded pagination (`limit` 1..100, `offset` >= 0), validated filters (`actor_id`, `document_id`, `action`, `outcome`, `start_date`, `end_date`), parameterized count and data queries, and deterministic ordering (`ORDER BY created_at DESC, id DESC`).
  - `GET /api/admin/audit-logs/:id`: validates numeric identifier, returns `404 Not Found` for missing events, and projects safe audit fields (`id`, `actor_id`, `document_id`, `action`, `outcome`, `details`, `created_at`).
  - Immutability: exposes no POST, PUT, PATCH, or DELETE routes (returns 404).
- Mounted router in `apps/api/src/server.ts` under `/api/admin/audit-logs`.
- Created local migration `supabase/migrations/20261022180000_audit_logs_actor_idx.sql` adding `CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs(actor_id, created_at DESC)`.
- Created `apps/api/src/audit.test.ts` with 44 automated tests.
- Updated `README.md` and `THREATS.md` (T7, T3).

**Developer review and decisions:**
- Resolved TypeScript error in `apps/api/src/routes/adminAudit.ts` where `req.params.id` can be typed as `string | string[]` in Express 5 by normalizing to string before regex validation.
- Corrected test mock lifecycle in `apps/api/src/audit.test.ts` so `mockAuthAs` is called before each individual HTTP probe in multi-request immutability assertions.
- Clearly differentiated between transactional audit persistence (coupled in the same transaction as business mutations; rolls back if audit fails) and standalone audit persistence (standalone `pool.query` write; catches errors to stderr to prevent crashing the response or recursing).
- Explicitly documented that append-only triggers protect against application-level modification but do not prevent PostgreSQL superuser alterations or guarantee audit availability if PostgreSQL is offline.
- **CodeRabbit Review Remediation (Phase 7):**
  1. *Validated `offset` as a safe integer:* Restricted offset to canonical non-negative integer representation (`/^(0|[1-9]\d*)$/`), capped at `Number.MAX_SAFE_INTEGER` (`9007199254740991`) using digit-length guards and `BigInt` bounds checks, and verified `Number.isSafeInteger(offset) && offset >= 0`. Rejects unsafe integers, decimals, leading zeros, and long digit strings with HTTP 400 before executing database queries.
  2. *Validated audit log ID against PostgreSQL BIGINT bounds:* Enforced canonical decimal integer pattern (`/^[1-9]\d*$/`), rejecting zero, leading-zero representations, negative values, and non-numeric inputs. Enforced PostgreSQL signed 64-bit BIGINT maximum (`9223372036854775807n`) before querying the database, while preserving valid IDs as strings to prevent precision loss.
  3. *Restored `## Known Limitations` in `README.md`:* Restored the complete Known Limitations section covering in-flight revocation, cross-system storage atomicity/orphaned objects, interrupted stream auditing, database outage audit failure windows, in-memory rate limiting, and unit test mock isolation.

**Verification:**
- `npm run check`: Exited with code `0`.
  - Typecheck: passed across `@trustvault/api` and `@trustvault/web`.
  - Production build: passed across `@trustvault/api` and `@trustvault/web`.
  - Automated tests: **149 total tests passed** (12 auth tests, 10 server tests, 83 documents tests, 44 audit tests).
  - All database client queries in tests are isolated unit tests using Vitest and Supertest with mocked pg pool.

**Outcome:** Phase 7 implemented, CodeRabbit findings resolved, tested, and verified.

**Commit reference:** Pending user review and manual commit.

---

## Entry 14 — Phase 8: UI Improvements, CodeRabbit Review Fixes, Document Refresh, and In-App Password Change

**Date:** 2026-10-23
**Task:** Complete remaining Phase 8 work, remediate confirmed CodeRabbit review findings, implement document dashboard refresh feedback, implement global search, and build in-app password change:
1. Address confirmed CodeRabbit findings across frontend components and backend routes.
2. Fix document list three-dot (⋮) overflow menu clipping by rendering as a floating overlay via React portal (`createPortal`) with viewport boundary adjustment.
3. Add a manual Refresh button to document views with spinning animation and informational refresh notice.
4. Implement global search with debounced partial and case-insensitive matching across filename, category, and owner.
5. Implement in-app change password dialog with current password verification via Supabase Auth and client-side password strength validation.
6. Add unit and integration tests covering new functionality.

**AI assistance:**
- Updated `apps/web/src/components/dashboard/DocumentsView.tsx` with floating React portal menu and refresh handler.
- Created `apps/web/src/components/dashboard/ChangePasswordModal.tsx` for secure in-app password changes.
- Added backend search query handling in `apps/api/src/routes/documents.ts` with parameterized SQL (`ILIKE %${search}%`).
- Added 14 automated tests in `apps/api/src/trustvault-enhancements.test.ts`.
- Added 17 automated tests in `apps/web/src/frontend-dashboard.test.tsx`.
- Updated `README.md` with Phase 8 documentation.

**Developer review and decisions:**
- Confirmed menu clipping was caused by overflow containers; portal to `document.body` resolved clipping cleanly.
- Resolved TypeScript import error in `trustvault-enhancements.test.ts` by importing `app` correctly from default export of `apps/api/src/server.ts`.
- Preserved existing permission-aware action buttons (Download, Edit, Permissions, Delete) according to document role.

**Verification:**
- `npm run check`: Exited with code `0`.
- All automated tests passed (**180 total tests passed**).

**Outcome:** Phase 8 UI improvements and usability features implemented, tested, and verified.

**Commit reference:** Committed in `1cf226b` (`feat: complete Phase 8 UI enhancements and review fixes`).

---

## Entry 15 — Phase 9: Security Testing, Vulnerability Remediation, and Overflow Menu Flicker Fix

**Date:** 2026-10-23
**Task:** Conduct comprehensive security audit, fix verified vulnerabilities, add security regression tests, and resolve three-dot menu positioning flicker:
1. Fix three-dot menu flicker where the menu momentarily appeared at `top: 0, left: 0` before repositioning.
2. Conduct security testing against authentication, IDOR/BOLA, privilege escalation, permission revocation, private storage access, upload validation, audit tampering, and SQL injection.
3. Implement `apps/api/src/security-phase9.test.ts` with 25 targeted security attack scenarios.
4. Verify parameterized SQL queries across all application endpoints.
5. Verify magic byte header validation and file extension filtering.

**AI assistance:**
- Fixed menu flicker in `apps/web/src/components/dashboard/DocumentsView.tsx` by synchronously measuring trigger button position with `getBoundingClientRect()` upon click, eliminating the unpositioned render frame.
- Created `apps/api/src/security-phase9.test.ts` covering 25 security test scenarios across 8 threat domains:
  - Domain 1: Authentication enforcement (missing/invalid tokens, expired JWTs, deactivation).
  - Domain 2: Authorization & IDOR prevention (unauthorized reads, updates, downloads return 404).
  - Domain 3: Administrative role enforcement (non-admin blocked with 403 on `/api/admin/audit-logs`).
  - Domain 4: Permission revocation immediate enforcement (revoked user blocked with 404 on next download).
  - Domain 5: Upload security (10 MB bound, disallowed extensions `.exe`/`.sh`, magic byte spoofing, path traversal).
  - Domain 6: SQL injection resistance (parameterized search, pagination, and filter queries).
  - Domain 7: Audit log immutability (POST/PUT/PATCH/DELETE return 404; transactional rollback on audit failure).
  - Domain 8: API abuse & rate limiting (429 on rate limit exhaustion, 2 MB body size limit).

**Developer review and decisions:**
- Resolved category requirement in upload regression tests by ensuring `category` multipart field is supplied.
- Confirmed menu opens seamlessly without visible jump or flicker.
- Verified that all database queries in tests use isolated mocks and do not make external calls.

**Verification:**
- `npm run check`: Exited with code `0`.
- Automated test suites: **205 total tests passed** across 7 test suites:
  - `apps/api/src/auth.test.ts` (12 tests)
  - `apps/api/src/server.test.ts` (10 tests)
  - `apps/api/src/documents.test.ts` (83 tests)
  - `apps/api/src/audit.test.ts` (44 tests)
  - `apps/api/src/trustvault-enhancements.test.ts` (14 tests)
  - `apps/api/src/security-phase9.test.ts` (25 tests)
  - `apps/web/src/frontend-dashboard.test.tsx` (17 tests)

**Outcome:** Phase 9 security testing and UI bug fix completed and fully verified.

**Commit reference:** Committed in `fa2d0ae` (`fix(ui): eliminate three-dot menu flicker and add security regression tests`).

---

## Entry 16 — Phase 10: Complete Documentation Suite & Threat Model Review

**Date:** 2026-10-24
**Task:** Inspect the codebase, produce complete pre-deployment documentation, review existing threat and prompt documents, and ensure zero duplicate documentation files:
1. Inspect codebase, dependencies, routes, and tests.
2. Produce comprehensive documentation suite: `docs/API.md`, `docs/openapi.yaml`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, `docs/TESTING.md`, `docs/ENVIRONMENT.md`, and `docs/CHANGELOG.md`.
3. Review existing `THREATS.md` and `PROMPTS.md` files; preserve existing file structure and prevent duplicate threat models (deleted redundant `docs/THREAT_MODEL.md`).
4. Perform automated repository-wide secret scanning across tracked files, build bundles, and configuration.
5. Update `THREATS.md` threat register (T1-T13), verification plan, and pre-deployment residual risks.
6. Update `README.md` and `docs/ARCHITECTURE.md` documentation sitemaps with links to `THREATS.md` and `PROMPTS.md`.

**AI assistance:**
- Generated complete documentation suite in `docs/`:
  - `docs/API.md`: Detailed REST API reference covering all 11 endpoints with schemas and curl examples.
  - `docs/openapi.yaml`: Validated OpenAPI 3.0 specification.
  - `docs/ARCHITECTURE.md`: Architecture specification with Mermaid sequence diagrams.
  - `docs/USER_GUIDE.md`: Comprehensive user guide with UI workflows and role matrix.
  - `docs/TESTING.md`: Complete testing guide with all 205 test cases documented.
  - `docs/ENVIRONMENT.md`: Environment variable security matrix and rotation procedures.
  - `docs/CHANGELOG.md`: Chronological log across Phases 1 through 10.
- Updated `THREATS.md` to reflect Phase 9/10 status across all 13 threats, 12 verification items, and 6 pre-deployment residual risks.
- Added Entries 14, 15, and 16 to `PROMPTS.md`.
- Updated `README.md` and `docs/ARCHITECTURE.md` sitemaps.

**Developer review and decisions:**
- Deleted redundant `docs/THREAT_MODEL.md` to maintain the existing project structure and retain `THREATS.md` as the single source of truth for threat modeling.
- Verified that no broken links or references to `docs/THREAT_MODEL.md` exist across the codebase.
- Verified that all claimed security controls accurately distinguish implemented code from pending remote migrations and operational prerequisites.

**Verification:**
- `npm run check`: Exited with code `0` (typechecks pass, builds pass, all 205 tests pass).
- Secret scan: 0 hardcoded credentials or secrets in tracked repository files.
- Zero broken links across documentation.

**Outcome:** Documentation complete, verified, and pre-deployment ready.

**Commit reference:** Pending user review and manual commit.

---

## Entry 17 — Global Role Model and Judge Demo Accounts

**Date:** 2026-10-24
**Task:** Implement three distinct global roles (`admin`, `owner`, `viewer`) with legacy `user` compatibility, reconcile pending migrations, create a repeatable judge demo account provisioning procedure, add comprehensive automated tests, and update documentation.

**Prompt summary:**
1. Inspect codebase, database schema, pending migrations, auth flow, and middleware.
2. Determine whether `owner` and `viewer` are global roles or document-level permissions.
3. Implement global roles: `admin` (audit console), `owner` (full document management), `viewer` (read-only access to shared documents, strictly prohibited from uploading, modifying, deleting, or sharing). Retain legacy `user` compatibility.
4. Enforce authorization server-side on Express endpoints.
5. Review pending migrations (`20261022180000_audit_logs_actor_idx.sql`, `20261024000000_allow_user_role.sql`, `20261024100000_add_document_description.sql`) and ensure they are safe, ordered, and compatible without downgrading `owner`.
6. Prepare three demo accounts (`demo.admin@trustvault.local`, `demo.owner@trustvault.local`, `demo.viewer@trustvault.local`) with no hardcoded credentials.
7. Add automated test coverage and update documentation.

**AI assistance:**
- Analyzed role model: Delineated Global User Roles (`public.users.role`) from Document-Level Permissions (`document_permissions.permission`).
- Updated `apps/api/src/middleware/auth.ts`: Set `GlobalRole = "admin" | "owner" | "viewer" | "user"`, set default provisioned role to `'owner'`, and preserved existing user roles upon session refresh.
- Hardened `apps/api/src/routes/documents.ts`: Enforced global viewer checks rejecting `POST /api/documents`, `PATCH /api/documents/:id`, `DELETE /api/documents/:id`, `GET /api/documents/:id/permissions`, `POST /api/documents/:id/permissions`, `PATCH /api/documents/:id/permissions/:userId`, and `DELETE /api/documents/:id/permissions/:userId` with `403 Forbidden` and denied audit logging.
- Adapted Frontend UI:
  - `apps/web/src/lib/api.ts`: Expanded `UserProfile.role` to include `viewer`.
  - `apps/web/src/components/dashboard/AppSidebar.tsx` & `AppHeader.tsx`: Role badges (Administrator, Viewer, Document Owner) and hid Quick Upload for viewers.
  - `apps/web/src/components/dashboard/OverviewView.tsx` & `DocumentsView.tsx`: Hid upload buttons and action overflow menu for viewers.
  - `apps/web/src/components/dashboard/SettingsView.tsx`: Added role explanation card.
- Reconciled migrations: Modified `supabase/migrations/20261024000000_allow_user_role.sql` to upgrade legacy `user` to `owner` (reversing previous downgrade) and safely expand check constraint to `CHECK (role IN ('admin', 'owner', 'viewer', 'user'))`.
- Created `apps/api/scripts/seed-judge-accounts.ts` and added `seed:judge-accounts` script in `package.json`, requiring `ENABLE_DEMO_ACCOUNTS=true` and reading distinct passwords (`DEMO_ADMIN_PASSWORD`, `DEMO_OWNER_PASSWORD`, `DEMO_VIEWER_PASSWORD`).
- Added `apps/api/src/judge-roles.test.ts` with 22 automated tests covering admin access, owner operations, viewer restrictions, IDOR defense, profile privilege escalation blocking, and backward compatibility.
- Updated `README.md`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, and `THREATS.md`.

**Developer review and decisions:**
- Resolved UUID format in mock tests to satisfy RFC 4122 v4 validator regex.
- Adjusted binary stream download test assertion to read from buffer.
- Verified that all secrets are supplied via runtime environment variables and never logged or committed.
- Maintained strict rule against applying remote migrations or running Git commands.

**Verification:**
- `npm run check`: Exited with code `0`.
- All 240 tests passed across all 9 test suites:
  - `apps/api/src/auth.test.ts` (12 tests)
  - `apps/api/src/server.test.ts` (10 tests)
  - `apps/api/src/documents.test.ts` (86 tests)
  - `apps/api/src/audit.test.ts` (44 tests)
  - `apps/api/src/trustvault-enhancements.test.ts` (19 tests)
  - `apps/api/src/security-phase9.test.ts` (20 tests)
  - `apps/api/src/judge-roles.test.ts` (22 tests)
  - `apps/api/src/seed-judge-accounts.test.ts` (13 tests)
  - `apps/api/src/auth-flows.test.ts` (14 tests)
- `npm run typecheck`: 0 TypeScript errors across `apps/api` and `apps/web`.
- `npm run build`: Production bundle builds succeeded cleanly.

**Outcome:** Global roles fully implemented, judge demo account procedure prepared, and all tests passing.

**Commit reference:** Pending user review and manual commit.

---

## Entry 18 — Frontend Vercel Configuration and Demo Account Verification

**Date:** 2026-10-24
**Task:** Configure Vercel SPA routing for the React + Vite frontend, verify demo account configuration with updated email conventions, update deployment documentation, and validate project.

**Prompt summary:**
1. Inspect repository structure, `apps/web`, Vite configuration, and deployment settings.
2. Add `vercel.json` at the correct deployment root (`apps/web`) with SPA wildcard rewrite (`/(.*)` -> `/index.html`) to support direct URL access and page refreshes on client-side routes like `/dashboard` and `/settings`.
3. Confirm demo accounts use `demo.admin@trustvault.local`, `demo.owner@trustvault.local`, and `demo.viewer@trustvault.local` with their dedicated password variables (`DEMO_ADMIN_PASSWORD`, `DEMO_OWNER_PASSWORD`, `DEMO_VIEWER_PASSWORD`) and require `ENABLE_DEMO_ACCOUNTS=true`.
4. Update `.env.example`, `README.md`, and `docs/ENVIRONMENT.md` with Vercel deployment instructions and demo account settings.
5. Validate `vercel.json` syntax and run `npm run check`.

**AI assistance:**
- Evaluated monorepo structure: determined that `apps/web` is the frontend deployment root where Vercel must be pointed.
- Created `apps/web/vercel.json` configuring standard SPA fallback rewriting all paths to `/index.html`.
- Validated JSON syntax via `node -e`.
- Updated `README.md` and `docs/ENVIRONMENT.md` with Vercel configuration instructions (Root Directory: `apps/web`, preset: Vite, output: `dist`).
- Verified that all 240 tests across 9 test suites continue passing with 0 TypeScript errors.

**Developer review and decisions:**
- Placed `vercel.json` in `apps/web` rather than repo root to align with Vercel's monorepo architecture where Root Directory is set to `apps/web`.
- Confirmed that backend Express API is hosted separately (e.g. Render, Railway) and not routed via Vercel serverless functions, ensuring no rewrite conflicts.

**Verification:**
- `node -e "JSON.parse(fs.readFileSync('apps/web/vercel.json', 'utf8'))"` passed cleanly.
- `npm run check`: Exited with code `0` (typechecking passed, production build passed, all 240 automated tests passed across 9 suites).

**Outcome:** Frontend SPA routing configured for Vercel and demo accounts fully verified.

**Commit reference:** Pending user review and manual commit.

---

## Responsible Use and Verification

AI-generated code, security recommendations, and documentation are treated as proposals requiring developer review.

For future entries, record:

1. The actual task and prompt used.
2. The generated implementation or recommendation.
3. A specific issue discovered during review.
4. The correction made by the developer.
5. The tests or commands actually executed.
6. The real commit reference, if available.

Do not record unexecuted tests as passed or describe planned security controls as implemented.

This document should be updated throughout development to reflect the actual work performed.

