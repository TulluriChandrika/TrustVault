# TrustVault — Testing & Verification Guide

This document describes the testing architecture, automated test suites, manual verification procedures, and quality validation commands for TrustVault.

> For threat model mapping, security attack scenarios, and mitigation verification status, see [THREATS.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/THREATS.md).

---

## 1. Automated Testing Architecture

TrustVault uses **Vitest** and **Supertest** to execute fast, isolated unit and integration tests against Express route handlers, middleware, authentication flows, and PostgreSQL transactions.

### Test Isolation Policy:
- Tests in `apps/api` mock external cloud dependencies (`pg.Pool`, Supabase Auth client, Supabase Storage) using `vi.fn()` and `setSupabaseAdminForTesting`.
- Tests run entirely in-memory without making network calls to live Supabase or live databases, ensuring fast, deterministic, reproducible execution.

---

## 2. Test Commands Reference

All test commands should be executed from the **repository root directory**:

| Command | Action | Scope |
|---|---|---|
| `npm test` | Runs all Vitest test suites. | `@trustvault/api` |
| `npm run typecheck` | Compiles TypeScript without emitting files. | Root, `apps/api`, `apps/web` |
| `npm run build` | Compiles backend TypeScript and Vite production bundle. | `apps/api`, `apps/web` |
| `npm run check` | Executes type checking, production build, and all tests. | Full repository pipeline |
| `npm run db:check` | Verifies live PostgreSQL database connectivity. | `apps/api` |

### Running Targeted Test Files:
To run an individual test suite:
```bash
# Run only security regression tests
npx vitest run src/security-phase9.test.ts --root apps/api

# Run document engine tests
npx vitest run src/documents.test.ts --root apps/api

# Run authentication integration tests
npx vitest run src/auth.test.ts --root apps/api
```

---

## 3. Test Suites Organization

The test suite consists of **7 test files** comprising **205 automated tests**:

```
apps/api/src/
├── auth-flows.test.ts            # 14 tests: Client auth error mapping, email validation, rate limits
├── auth.test.ts                  # 12 tests: JWT verification, user provisioning, role protection
├── server.test.ts                # 10 tests: Server bootstrap, health endpoint, rate limiting, error handling
├── trustvault-enhancements.test.ts# 19 tests: Global search, descriptions, custom categories, profile sync
├── security-phase9.test.ts       # 20 tests: Security regression, permissions, revocations, overflow menu
├── audit.test.ts                 # 44 tests: Administrative audit logs, pagination, date & UUID filters
└── documents.test.ts             # 86 tests: File uploads, downloads, sharing, permissions, rollbacks
```

### Key Verification Coverage:
1. **Authentication & Session Security (`auth.test.ts`, `auth-flows.test.ts`, `security-phase9.test.ts`):**
   - Rejection of unauthenticated requests (`401 Unauthorized`).
   - Rejection of malformed Bearer tokens.
   - Rejection of deactivated accounts (`is_active: false`) with `403 Forbidden`.
   - Protection against privilege escalation during user profile updates (`PATCH /api/me`).
2. **Document Permission Boundaries (`documents.test.ts`, `security-phase9.test.ts`):**
   - Reader cannot update metadata (`403 Forbidden`).
   - Editor cannot delete documents (`403 Forbidden`).
   - Editor cannot grant or revoke sharing permissions (`403 Forbidden`).
   - Unauthorized users receive `404 Not Found` (non-disclosure) on document read or download attempts.
3. **Storage & Revocation Security (`documents.test.ts`, `security-phase9.test.ts`):**
   - Immediate denial of file downloads once permission is revoked (`revoked_at IS NOT NULL`).
   - Enforcement of private storage streaming with `X-Content-Type-Options: nosniff` and sanitized `Content-Disposition`.
   - Compensating cleanup deletes orphaned storage objects if database insertions fail.
4. **Input & Upload Validation (`documents.test.ts`, `security-phase9.test.ts`):**
   - File size limits (10 MB maximum).
   - Magic byte validation for PDF, PNG, JPEG, and WebP formats.
   - Text file UTF-8 and null-byte rejection.
   - Truncation and sanitization of filenames.
5. **Administrative Audit Controls (`audit.test.ts`, `security-phase9.test.ts`):**
   - Non-admin callers receive `403 Forbidden` when accessing `/api/admin/audit-logs`.
   - Denied access attempts are logged automatically.
6. **UI Menu Algorithm (`security-phase9.test.ts`):**
   - Right-edge alignment calculation for three-dot menus.
   - Viewport overflow detection and upward flipping.
   - Pre-paint height calculations for Owner vs Editor roles to eliminate layout flicker.

---

## 4. Manual Verification Checklists

In addition to automated tests, the following scenarios should be verified manually in a browser or staging environment:

### 4.1 Three-Dot Menu Positioning & Lack of Flicker
1. **Table View Test:**
   - Log in and open the Documents table.
   - Click the three-dot (`⋮`) button.
   - Verify that the menu opens immediately beside the button without jumping from `(0, 0)` or flashing.
2. **Grid View Test:**
   - Switch to Grid View.
   - Click the three-dot button on various cards.
   - Verify card dimensions and row heights do not shift or distort.
3. **Viewport Bottom Edge Test:**
   - Scroll until the bottom document card is within 100px of the viewport bottom.
   - Click the three-dot button.
   - Verify the menu flips above the button and remains visible.
4. **Keyboard Accessibility:**
   - Press <kbd>Escape</kbd>: Verify the menu closes and focus returns to the button.
   - Press <kbd>Tab</kbd> / <kbd>Down Arrow</kbd>: Verify items receive focus in sequence.

### 4.2 Sharing & Immediate Revocation Lifecycle
1. **User A (Owner)** uploads `Confidential_Brief.pdf`.
2. **User A** shares the document with **User B** as `Reader`.
3. **User B** logs in, verifies the document appears in **Shared with Me**, and successfully downloads it.
4. **User A** opens the Share modal and clicks **Revoke** for **User B**.
5. **User B** attempts to download the document again:
   - The download fails with a friendly notification.
   - A direct API `curl` request to `/api/documents/:id/download` returns `404 Document not found`.

---

## 5. Testing Limitations & Scope

- **In-Memory Mocking:** The automated test suite mocks Supabase and PostgreSQL connections for speed and isolation. Live network latency, cloud bucket permissions, and database indexes should be verified in a staging environment.
- **Client Antivirus Notice:** Upload magic-byte checks verify format signatures (e.g. `%PDF-`); they do not provide real-time antivirus or malware sandboxing.
- **Browser Automation:** While UI algorithms are tested in Vitest and accessibility attributes are verified in JSX, full cross-browser rendering should be evaluated across Chrome, Firefox, Safari, and Edge.
