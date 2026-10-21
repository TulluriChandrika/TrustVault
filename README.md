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

### Authentication

**Supabase Auth** is the identity provider. The Express API enforces authorization
for every protected operation. Authentication endpoints will be implemented in a
future phase.

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

## Database Migrations

| Migration | Status | Purpose |
|---|---|---|
| `20261020161206_create_trustvault_schema.sql` | **Applied** (Remote & Local) | Core tables: users, documents, permissions, audit logs, sessions |
| `20261021100000_security_hardening.sql` | **Pending** (Local only) | RLS policies, append-only audit triggers (including TRUNCATE), updated_at trigger |

> **Status verified via `npx supabase migration list` & live schema inspection:** `20261020161206` is recorded as applied to the remote database; `20261021100000` is present locally and pending application/review.

## Known Limitations

- Frontend application features (document upload, access-control management, audit explorer) are pending; baseline environment is established.
- Authentication endpoints are not yet built.
- Document CRUD and file storage are not yet implemented.
- Rate limiting is in-memory only — not suitable for multi-instance deployments
  without an external store (e.g., Redis).
- `THREATS.md` documents 13 identified threat profiles; individual mitigations remain pending implementation and verification.
- The `users.password_hash` column exists in the schema but is not used by the
  current Supabase Auth strategy. Compatibility will be resolved in Phase 4.

## License

Private — all rights reserved.
