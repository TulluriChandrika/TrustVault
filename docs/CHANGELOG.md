# TrustVault — Project Changelog

All notable changes and phase milestones across the TrustVault application are documented in this file.

---

## [Phase 10] - Documentation & Final Preparation (Current)

### Added
- Created comprehensive [README.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/README.md) covering all 17 required project specification sections.
- Created [docs/ENVIRONMENT.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ENVIRONMENT.md) with complete server/client variable reference, exposure rules, and sanitized templates.
- Created [docs/API.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/API.md) detailing all REST endpoints, validation rules, responses, and non-disclosure error behavior.
- Created [docs/openapi.yaml](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/openapi.yaml) providing an OpenAPI 3.0 specification with complete schemas and BearerAuth security.
- Created [docs/ARCHITECTURE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ARCHITECTURE.md) with Mermaid sequence diagrams, compensating cleanup workflows, and security boundary definitions.
- Created [docs/USER_GUIDE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/USER_GUIDE.md) explaining UI navigation, upload/download flows, permission delegation, and settings.
- Created [docs/TESTING.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/TESTING.md) detailing test execution, unit/integration test organization, and manual testing checklists.

---

## [Phase 9] - Security Testing & UI Bug Remediation

### Fixed
- **Three-Dot Menu Flicker:** Resolved positioning flash and jump by unifying `floatingMenu` state, calculating initial coordinates synchronously before render, refining pre-paint via `useLayoutEffect`, and removing `-9999px` off-screen rendering.
- **Card Layout Stability:** Converted three-dot menu into a React portal (`document.body`) with `position: fixed` and `z-index: 9999`, eliminating container clipping and card distortion.

### Added
- **Security Regression Suite (`apps/api/src/security-phase9.test.ts`):** 20 automated tests verifying authentication rejection, privilege escalation prevention, permission boundaries, immediate access revocation, private storage streaming with nosniff, upload magic-byte validation, admin audit isolation, and menu positioning algorithms.

---

## [Phase 8] - UI Enhancements & Usability Polish

### Added
- **Global Search Bar:** Case-insensitive search across document titles, categories, descriptions, owner names, and owner emails.
- **Document Descriptions:** Added optional description field (up to 1000 characters) across database schema, upload modal, edit details modal, and grid cards.
- **In-App Password Change:** Implemented `ChangePasswordModal` allowing users to update their password directly without an email reset loop.
- **Manual Document Refresh:** Added Refresh button beside the search bar with spinner state and visual toast feedback.
- **Category Filter Pills:** Horizontal scrollable category filters for quick narrowing of document views.
- **Profile Name Preservation:** Enhanced `public.users` upsert with `COALESCE` to prevent overwriting user-edited full names during login sync.

---

## [Phase 7] - Administrative Audit Trail

### Added
- **Administrative Audit Endpoint (`GET /api/admin/audit-logs`):** Filter by actor, document, action, outcome, and date range with pagination controls.
- **Admin Role Verification Middleware (`requireAdmin`):** Strict verification of `req.user.role === 'admin'`; non-admin attempts are rejected with `403` and logged as denied audit events.

---

## [Phase 6] - Private Storage & Document Lifecycle

### Added
- **Private Object Storage:** Integration with Supabase private storage bucket (`trustvault-private`).
- **Secure File Downloads:** Server-side streaming endpoint with `X-Content-Type-Options: nosniff` and RFC 6266 / RFC 5987 sanitized filenames.
- **Upload Content Inspection:** Magic byte verification for PDF, PNG, JPEG, and WebP, plus UTF-8 null-byte validation for text files.
- **Compensating Cleanup:** Transactional cleanup to delete orphaned storage objects if database insertions fail.

---

## [Phase 5] - Document Engine & Permission Delegation

### Added
- **Document CRUD:** Endpoints for creating, listing, viewing, updating, and soft-deleting documents.
- **Permission Management:** Granting (`POST /api/documents/:id/permissions`), updating, and immediately revoking (`DELETE ...`) `read` and `edit` access.
- **Non-Disclosure Philosophy:** Returning `404 Not Found` for unauthorized document requests to prevent ID probing.

---

## [Phase 4] - Authentication & User Provisioning

### Added
- **Supabase Auth Verification:** Express middleware verifying incoming Bearer JWTs against Supabase Auth.
- **Idempotent User Provisioning:** Mapping verified Supabase user UUIDs into `public.users` while preserving existing roles.
- **Deactivated Account Enforcement:** Immediate rejection of deactivated accounts (`is_active = false`) with `403 Forbidden`.

---

## [Phases 1–3] - Initial Foundation & Database Schema

### Added
- **Monorepo Structure:** npm workspaces configured for `apps/web` and `apps/api`.
- **Database Schema:** PostgreSQL tables for `users`, `documents`, `document_permissions`, and `audit_logs`.
- **Frontend Baseline:** React 19, TypeScript, Vite, Tailwind CSS v3, and Lucide icons.
