# TrustVault

Secure document sharing with per-document authorization and an auditable access trail.

## Prerequisites

- **Node.js** ≥ 22
- **npm** ≥ 10
- **Supabase CLI** (for migration management)
- **Docker** (optional, for containerized deployment)

## Getting Started

### 1. Clone the repository

```powershell
git clone https://github.com/TulluriChandrika/TrustVault.git
cd TrustVault
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure environment variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill in the values for your Supabase project. See `.env.example`
for the full list of variables. **Never commit `.env` to version control.**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase or local) |
| `PORT` | No | API server port (default: 4000) |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:5173`) |
| `SESSION_SECRET` | Yes | Secret for session signing |
| `SUPABASE_URL` | Yes | Supabase project URL (server-side only) |
| `SUPABASE_SECRET_KEY` | Yes | Supabase service-role key (server-side only, **never expose to browser**) |
| `TRUST_PROXY` | No | Set to `"1"` if behind a reverse proxy |

### 4. Review and apply database migrations

Migrations live in `supabase/migrations/` and must be reviewed before application.

```powershell
# List migration status
npx supabase migration list

# Apply after review (interactive confirmation)
npx supabase db push
```

> **Important:** Never apply migrations blindly. Review each SQL file first.

### 5. Run the API (development)

```powershell
npm run dev:api
```

The server starts on `http://localhost:4000` with hot-reload via `tsx`.

### 6. Run tests

```powershell
npm run test --workspace=apps/api
```

### 7. Type-check and build

```powershell
npm run build --workspace=apps/api
```

## Project Structure

```
trustvault/
├── apps/
│   ├── api/             # Express 5 backend (TypeScript)
│   │   └── src/
│   │       ├── server.ts         # Entry point with security middleware
│   │       └── db/
│   │           ├── pool.ts       # PostgreSQL connection pool
│   │           └── check-connection.ts  # Standalone DB check
│   └── web/             # Frontend (React 19, TypeScript, Vite baseline)
├── packages/
│   └── shared/          # Shared types and utilities (planned)
├── supabase/
│   ├── config.toml      # Supabase CLI configuration
│   └── migrations/      # Database migrations (source of truth)
├── tests/
│   └── security/        # Security test suite (planned)
└── docs/                # Documentation (planned)
```

## Security Architecture

### Authentication & User Provisioning (Phase 4)

- **Supabase Auth** is the sole identity and password-authentication system.
- **Backend Verification**: Express verifies Bearer JWT access tokens via `supabaseAdmin.auth.getUser(token)`.
- **Idempotent User Provisioning**: Authenticated Supabase users are mapped into `public.users` using the verified Supabase Auth UUID as `public.users.id`. Provisioning queries use `ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`, strictly preserving existing `role` and `is_active` states.
- **Role Assignment**: Clients cannot assign or elevate roles. New signups receive the default `'owner'` role. Administrator privileges are reserved for backend/DB administration.
- **Deactivated Account Enforcement**: If `is_active` is `false`, requests are immediately rejected with `403 Forbidden` (`Account is deactivated`). Login attempts alone never reactivate an account.
- **Protected Endpoints**: `/api/me` and `/api/auth/me` return safe profile attributes (`id`, `email`, `role`, `is_active`, `created_at`) and omit `password_hash` and secrets.
- **Frontend Flow**: Minimal functional auth in `apps/web` supports account creation, login, session persistence, logout, and token-authenticated profile probing against `/api/me`.

### Document and Permission Engine (Phase 5)

- **Server-Side Authorization**: Because the backend connects using the `postgres` role (which bypasses RLS), all access controls are verified in Express for every protected document operation.
- **Ownership Immutability**: `owner_id` is derived strictly from the verified Supabase Auth user on creation (`req.user.id`) and cannot be assigned or altered by clients.
- **Permission Hierarchy**:
  - `owner`: Full metadata control, grant/revoke permissions, soft-delete document.
  - `edit`: Read metadata and update editable fields (`title`, `category`); cannot delete document, change owner, or manage permissions.
  - `read`: Read-only access to metadata; cannot mutate document or manage permissions.
- **Duplicate Grant Prevention**: Duplicate active permission grants are rejected with `409 Conflict`. Active grants must be revoked before granting a different permission level.
- **Immediate Revocation**: Revoking a permission sets `revoked_at = now()`, immediately invalidating access on the very next request.
- **Transactional Audit Logging**: Mutations (`create`, `update`, `delete`, `grant`, `revoke`) write audit records inside the same SQL transaction. If audit log recording fails, the transaction is rolled back, preventing any mutation from persisting without an audit trail.
- **Endpoints**:
  - `GET /api/documents` — List owned and actively shared documents.
  - `POST /api/documents` — Upload a document file (multipart/form-data) or create document metadata (JSON).
  - `GET /api/documents/:id` — Retrieve metadata if owner, editor, or reader.
  - `GET /api/documents/:id/download` — Authorize and stream file download from private storage.
  - `PATCH /api/documents/:id` — Update allowed metadata (`title`, `category`) if owner or editor.
  - `DELETE /api/documents/:id` — Soft-delete document if owner.
  - `GET /api/documents/:id/permissions` — List active grants if owner.
  - `POST /api/documents/:id/permissions` — Grant `read` or `edit` permission to active user if owner.
  - `DELETE /api/documents/:id/permissions/:userId` — Revoke active grant if owner.

### Secure Document Lifecycle & Private Storage (Phase 6)

- **Private Object Storage**: Files are stored in a private Supabase Storage bucket (`trustvault-private`). Public URLs are never used.
- **Server-Side Storage Key Generation**: Keys follow `private/${userId}/${uuid}.${ext}`. Clients can never specify storage keys or object paths.
- **Strict Content & Multipart Validation**:
  - Maximum file size: **10 MB** (enforced by `multer` and request bounds).
  - Multipart limits: exactly **1 file** (`files: 1`), max **10 fields** (`fields: 10`), max **20 parts** (`parts: 20`), and max **64 KB** field size (`fieldSize: 64KB`).
  - Allowed MIME types: PDF (`application/pdf`), Images (`image/png`, `image/jpeg`, `image/webp`), and Text/Data (`text/plain`, `text/csv`).
  - Magic byte inspection verifies declared MIME types against format signatures (PDF, PNG, JPEG, WebP).
  - Plain text and CSV files are validated for UTF-8 encoding and inspected to reject null bytes (`0x00`) and control characters.
  - Filenames are sanitized, stripping directory traversal patterns, control characters, and unsafe symbols.
  - *Security note:* Magic-byte signature checking validates file headers but is not a substitute for an active antivirus sandbox.
- **Cross-System Failure Handling (Compensating Cleanup)**:
  - Files are uploaded to private storage first.
  - The metadata record and `file:upload` audit log are then inserted within an atomic PostgreSQL transaction.
  - If database connection acquisition, transaction begin, metadata insertion, or audit logging fails, compensating cleanup runs immediately to delete the orphaned object from storage.
  - Cleanup is guaranteed to run even if transactional `ROLLBACK` throws an error.
  - **Ambiguous COMMIT failure protection**: Distinguishes three transaction outcomes (`uncommitted`, `committed`, `unknown`). If the verification query fails, times out, or loses connection, the outcome remains `unknown` and the storage object is strictly preserved. If conclusively `committed`, the server executes schema-safe soft-delete (`UPDATE public.documents SET deleted_at = now()`) before deleting storage, preserving referential integrity and audit trail history; if soft-delete fails, storage is preserved and an operational alert is logged.
- **Authorized Backend-Mediated Downloads**:
  - Downloads (`GET /api/documents/:id/download`) require valid authentication and verify caller access level (`owner`, `edit`, or `read`).
  - Deleted or unshared documents return `404 Not Found` (anti-enumeration).
  - Metadata-only records (`raw/...` or non-`private/`) cannot be downloaded as files (`404 Not Found`).
  - RFC 6266 and RFC 5987 compliant `Content-Disposition` header: derives both a safe ASCII fallback filename and UTF-8 percent-encoded `filename*` parameter from a commonly normalized filename with all path separators (/ and \) and traversal sequences stripped, while removing CR/LF to prevent HTTP response splitting.
  - Downloads stream directly from the backend with `nosniff` headers.
  - Response stream lifecycle tracking: completed byte writes are audited on `finish`, while aborted client connections are audited on `close` as transfer failures. An in-memory guard prevents duplicate audit attempts per request lifecycle; database write failures are caught and logged safely without crashing the response.
  - Because downloads are backend-mediated on every request, permission revocation takes effect immediately on subsequent requests.

### Database Access

All application data access goes through the Express backend via direct PostgreSQL
connection (`DATABASE_URL`), connecting as the `postgres` role (which has `BYPASSRLS`).
Application-level authorization must be enforced in the Express backend.

Row-Level Security (RLS) policies on all tables provide defense-in-depth for the
Supabase PostgREST Data API:

- **`service_role`** — full access for administrative and service-role API clients
- **`anon` / `authenticated`** — blocked from direct table access by default

### Audit Trail

The `audit_logs` table is protected by database triggers that enforce append-only
semantics. `UPDATE`, `DELETE`, and `TRUNCATE` operations on audit records are rejected
at the database level.

### API Hardening

- **Helmet** — sets security-related HTTP headers
- **express-rate-limit** — in-memory rate limiting (100 req/15 min per IP)
- **CORS** — restricted to the configured frontend origin
- **JSON body limit** — 2 MB maximum
- **Multipart file limit** — 10 MB maximum

## Database Migrations

| Migration | Status | Purpose |
|---|---|---|
| `20261020161206_create_trustvault_schema.sql` | **Applied** (Remote & Local) | Core tables: users, documents, permissions, audit logs, sessions |
| `20261021100000_security_hardening.sql` | **Pending** (Local only) | RLS policies, append-only audit triggers (including TRUNCATE), updated_at trigger |
| `20261021183000_align_users_supabase_auth.sql` | **Prepared** (Local only) | Alters `public.users.password_hash` to `DROP NOT NULL DEFAULT NULL` for Supabase Auth |

> **Status note:** `20261020161206` is applied remotely. Migrations `20261021100000` and `20261021183000` are prepared locally and must be reviewed before remote application.

## Known Limitations

- **In-flight revocation boundary:** In-flight download streams already in transit across network sockets during revocation cannot be recalled; however, any subsequent request is immediately denied on the server.
- **Cross-system atomicity limitation:** PostgreSQL transactions and cloud object storage do not share a distributed two-phase commit (2PC). If the database transaction fails and the compensating storage `remove()` call also fails (e.g. due to a network partition), an unreferenced object will remain in private storage.
- **Audit tracking on aborted streams:** Downloads track the response `finish` and `close` events; client disconnects or aborted connections before completion are audited as transfer failures (`client_disconnected_or_transfer_interrupted`), preventing partial transfers from being falsely recorded as completed downloads.
- **Audit persistence during database errors:** In-memory lifecycle deduplication (`downloadAuditRecorded`) ensures the application initiates at most one download audit attempt per request, but successful persistence in PostgreSQL cannot be guaranteed if the database is offline or the insert fails. In accordance with the standalone audit policy, such failures are safely logged to stderr to avoid crashing the server process or interrupting the client download.
- **Test isolation scope:** Automated test suites (`auth.test.ts`, `server.test.ts`, `documents.test.ts`) are isolated in-memory unit tests using Vitest and Supertest with mocked database and storage clients. Production readiness requires live end-to-end integration testing against real Supabase and PostgreSQL infrastructure.
- **In-memory rate limiting:** Rate limiting is in-memory only — not suitable for multi-instance deployments without an external distributed store (e.g., Redis).
- **Threat model verification:** `THREATS.md` documents 13 identified threat profiles; T1, T2, T3, T4, T5, T6, and T12 have been implemented and verified.

## License

Private — all rights reserved.
