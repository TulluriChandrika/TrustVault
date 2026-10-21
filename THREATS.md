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

**Verification:** Owner A must not access Owner B's document without an explicit valid grant.

**Status:** Planned for Phase 5 (Document and Permission Engine).

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

### T4 — Improper permission grants and revocation

**Asset:** Sharing permissions and document confidentiality.

**Threat:** An unauthorized user grants access, or a revoked user continues accessing a document.

**Impact:** Persistent unauthorized access.

**Mitigations:**
- Restrict grants and revocations to authorized owners or explicitly permitted administrators.
- Validate that the target user and document exist.
- Check the active permission state on every protected request.
- Ensure revocation takes effect immediately.
- Avoid long-lived download URLs that remain usable after revocation unless their risk is explicitly addressed.

**Verification:** Grant access, verify it works, revoke it, and verify that the same access path now fails.

**Status:** Planned or unverified.

### T5 — Public storage exposure

**Asset:** Uploaded documents.

**Threat:** Files become accessible through a public bucket, leaked object URL, or improperly issued signed URL.

**Impact:** Confidential documents can be downloaded without authorization.

**Mitigations:**
- Use a private storage bucket.
- Keep service credentials on the backend.
- Generate storage keys server-side.
- Authorize downloads before issuing access.
- Use short-lived access URLs where appropriate and understand their revocation limitations.

**Verification:** An unauthenticated user must not retrieve a private document directly from storage.

**Status:** Planned or unverified. The intended bucket name is `trustvault-private`; its live privacy configuration has not been established by the evidence in this report.

### T6 — Malicious or oversized uploads

**Asset:** API availability, stored files, and downstream document-processing systems.

**Threat:** An attacker uploads oversized files, misleading file types, or malicious content.

**Impact:** Resource exhaustion, unsafe processing, or storage abuse.

**Mitigations:**
- Enforce file-size limits.
- Validate allowed file types using more than the filename extension.
- Generate safe storage keys.
- Reject malformed input.
- Consider malware scanning where appropriate.
- Avoid executing uploaded content.

**Verification:** Test oversized files, disallowed MIME types, mismatched extensions, and malformed uploads.

**Status:** Planned or unverified. Phase 2's JSON body limit does not establish secure multipart file-upload validation.

### T7 — Audit-log tampering

**Asset:** Evidence of access, sharing, and security incidents.

**Threat:** An attacker or overly privileged application role modifies, deletes, or truncates audit records.

**Impact:** Loss of accountability and concealment of unauthorized activity.

**Existing migration design:**
- The local security-hardening migration defines row-level triggers that reject `UPDATE` and `DELETE` operations on `audit_logs`.
- That migration is not recorded as applied remotely in the latest migration-list output.

**Limitations:**
- Row-level `UPDATE` and `DELETE` triggers do not prevent `TRUNCATE`.
- A database superuser or sufficiently privileged administrator may bypass ordinary protections.
- Append-only triggers do not by themselves provide cryptographic tamper evidence.

**Mitigations:**
- Review and apply appropriate database privileges.
- Explicitly restrict `TRUNCATE` and unnecessary table privileges.
- Restrict audit retrieval to authorized roles.
- Consider tamper-evident integrity verification and an independently protected checkpoint if required.

**Verification:** Test unauthorized updates, deletes, truncation attempts, and audit retrieval permissions in a disposable test database.

**Status:** Partially designed; remote deployment and effective protection remain unverified.

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
