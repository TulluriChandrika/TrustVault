# TrustVault — Secure Document Management & Access Trail

> **TrustVault** is a secure document-sharing and lifecycle platform featuring cryptographic user authentication, server-enforced per-document authorization, immediate permission revocation, private object storage, and transactional audit trails.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5-green.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791.svg)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Storage-3ecf8e.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-240%20Tests%20Passed-yellow.svg)](https://vitest.dev/)

---

## 1. Project Overview

TrustVault enables organizations and individuals to securely store, share, and collaborate on sensitive documents. Unlike generic file-sharing services that rely solely on public signed links or client-side authorization, TrustVault enforces strict server-side access controls on every API call, delivers files through an authorized private storage proxy, and logs all state mutations in an immutable audit trail.

---

## 2. Problem Statement & Project Objectives

### The Problem
Traditional document-sharing platforms often suffer from critical security gaps:
- **Over-Permissive Storage:** Files are exposed via public object storage URLs or long-lived pre-signed URLs that cannot be revoked once shared.
- **Client-Side Authorization:** Insecure Direct Object Reference (IDOR) vulnerabilities allow attackers to manipulate document IDs and access confidential records.
- **Delayed or Non-Existent Revocation:** When an employee or collaborator leaves a project, revoking access does not invalidate previously issued links or tokens.
- **Missing or Fragmented Audit Trails:** Document views, downloads, and permission changes are rarely tracked in a centralized, queryable log.

### TrustVault Objectives
1. **Server-Side Permission Enforcement:** Every document operation (view, edit, delete, download, share, revoke) is validated against active database permissions on the backend.
2. **Zero Public Storage Exposure:** Files are stored in a private object bucket (`trustvault-private`) and streamed exclusively through authenticated, authorized server endpoints.
3. **Immediate Access Revocation:** Revoking access invalidates future permissions instantly on the next request.
4. **Non-Disclosure Security:** Unauthorized requests to private documents receive `404 Not Found` rather than `403 Forbidden`, preventing metadata leakage and ID enumeration.
5. **Transactional Audit Logging:** Document mutations and permission grants are recorded in atomic SQL transactions alongside their respective operations.

---

## 3. Main Features

- **Robust Authentication:** Secure email/password authentication, session persistence, unconfirmed email guards, rate-limiting, and in-app password changes via Supabase Auth.
- **Role-Based Access Hierarchy:**
  - **Owner:** Complete control over document metadata, sharing, access delegation, and deletion.
  - **Editor:** Permission to view, download, and update document metadata (title, category, description); cannot delete or manage permissions.
  - **Reader:** Permission to view metadata and download the original file; cannot mutate metadata or manage permissions.
- **Private File Storage & Streaming:** Secure delivery of PDFs, images (PNG, JPEG, WebP), and plain text/CSV files up to 10 MB.
- **Input Validation & Magic-Byte Inspection:** Enforces strict binary header signatures (e.g., `%PDF-`, PNG magic bytes) to prevent MIME spoofing and executable uploads.
- **Global Search & Filter Engine:** Real-time, case-insensitive search across titles, categories, descriptions, and owner details, complemented by category filter pills and view scopes (All, Owned, Shared).
- **Compensating Storage Reconciliation:** Atomic database transactions with rollback and automated storage cleanup for orphaned uploads.
- **Dual Audit System:**
  - **Owner Activity Trail:** Document owners can review download, edit, and access events for their documents.
  - **Administrative Audit Console:** Verified administrators can query the global audit log across actors, documents, actions, outcomes, and date ranges.
- **Pixel-Perfect Responsive UI:** Built with Tailwind CSS, Lucide icons, and a flicker-free floating portal overflow menu with pre-paint positioning and full keyboard accessibility.

---

## 4. Technology Stack

### Frontend (`apps/web`)
- **Framework:** React 19 (SPA) with TypeScript
- **Build Tool:** Vite 8
- **Styling:** Tailwind CSS v3 with `@tailwindcss/forms` and `tailwindcss-animate`
- **Component Primitives:** Radix UI Dialog, Tooltip, and Separator
- **Icons:** Lucide React
- **Auth Client:** `@supabase/supabase-js`

### Backend API (`apps/api`)
- **Runtime:** Node.js (v22+)
- **Framework:** Express 5
- **Language:** TypeScript (NodeNext module resolution)
- **Database Driver:** `pg` (PostgreSQL client pool)
- **Storage Client:** `@supabase/supabase-js` (Server-side Admin client)
- **Security Middleware:** `helmet` (HTTP headers), `express-rate-limit` (in-memory rate limiting), `cors` (origin whitelisting), `multer` (multipart upload controls)
- **Execution & Dev Tools:** `tsx` (TypeScript execution and hot-reloading)

### Database & Storage
- **Database:** PostgreSQL (local or Supabase cloud)
- **Object Storage:** Supabase Private Storage (`trustvault-private` bucket)
- **Schema Management:** Supabase CLI migrations (`supabase/migrations/`)

### Testing & QA
- **Test Runner:** Vitest v5
- **HTTP Assertions:** Supertest
- **Test Suite:** 8 test files, 227 automated unit and integration tests

---

## 5. Architecture Overview

TrustVault operates as a decoupled monorepo using npm workspaces:

```
trustvault/
├── apps/
│   ├── api/                    # Express 5 REST API Backend
│   │   ├── scripts/            # CLI utilities (seed-admin.ts, migrations)
│   │   └── src/
│   │       ├── db/             # Connection pool and migration scripts
│   │       ├── middleware/     # requireAuth (JWT verification) & requireAdmin
│   │       ├── routes/         # auth.ts, documents.ts, adminAudit.ts
│   │       ├── utils/          # validation.ts (magic bytes, filename sanitization)
│   │       ├── audit.ts        # Transactional audit logging engine
│   │       └── server.ts       # Express bootstrap, Helmet, CORS, Rate Limit
│   └── web/                    # React 19 Frontend Application
│       └── src/
│           ├── components/     # Modals, header, sidebar, document views
│           ├── lib/            # api.ts (fetch client), supabase.ts (auth SDK)
│           ├── pages/          # login-page.tsx, signup-page.tsx, reset-password
│           └── App.tsx         # Auth state routing and DashboardLayout
├── docs/                       # Comprehensive documentation suite
│   ├── API.md                  # REST API reference
│   ├── ARCHITECTURE.md         # In-depth architectural & security specification
│   ├── CHANGELOG.md            # Release and phase milestone history
│   ├── ENVIRONMENT.md          # Environment variable reference
│   ├── openapi.yaml            # OpenAPI 3.0 specification
│   ├── TESTING.md              # Testing guide & verification checklists
│   └── USER_GUIDE.md           # User workflows and permission guide
├── supabase/
│   ├── config.toml             # Supabase CLI project configuration
│   └── migrations/             # SQL migrations (source of truth)
└── docker-compose.yml          # Container configuration for API
```

For detailed request sequence diagrams and compensating cleanup flows, see [docs/ARCHITECTURE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ARCHITECTURE.md).

---

## 6. Prerequisites

Ensure your development environment meets the following minimum requirements:
- **Node.js:** `>= 22.0.0`
- **npm:** `>= 10.0.0`
- **PostgreSQL:** Local PostgreSQL instance or a free [Supabase](https://supabase.com) project
- **Git**

---

## 7. Installation & Local Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/TulluriChandrika/TrustVault.git
cd TrustVault
```

### Step 2: Install Workspace Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create your local `.env` file from the provided template:
```bash
# On Linux/macOS
cp .env.example .env

# On Windows PowerShell
Copy-Item .env.example .env
```
Open `.env` and fill in your database and Supabase project credentials. For details on every variable, consult [docs/ENVIRONMENT.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ENVIRONMENT.md).

---

## 8. Environment Configuration Reference

TrustVault separates server-side secrets from public client variables:

| Variable | Target | Required | Description |
|---|---|:---:|---|
| `DATABASE_URL` | Backend | **Yes** | PostgreSQL connection URI (`postgresql://postgres:...@localhost:54322/postgres`). |
| `SUPABASE_URL` | Backend | **Yes** | Fully qualified Supabase project URL (`https://xyzcompany.supabase.co`). |
| `SUPABASE_SECRET_KEY` | Backend | **Yes** | Supabase **Service Role** key. **Never expose to the client.** |
| `STORAGE_BUCKET_NAME` | Backend | No | Storage bucket name (default: `trustvault-private`). |
| `FRONTEND_ORIGIN` | Backend | No | Allowed CORS origin (default: `http://localhost:5173`). |
| `PORT` | Backend | No | API listening port (default: `4000`). |
| `VITE_SUPABASE_URL` | Frontend | **Yes** | Public Supabase project URL for browser client SDK. |
| `VITE_SUPABASE_ANON_KEY` | Frontend | **Yes** | Public Supabase **Anon** key for browser client SDK. |
| `VITE_API_URL` | Frontend | No | Express API base URL (default: relative `/api` proxied by Vite). |

> [!CAUTION]
> Never commit `.env` to Git. Do not prefix backend secrets with `VITE_`, as Vite will bundle them into public JavaScript files.

---

## 9. Database & Supabase Setup

### Database Migrations
Database migrations reside in `supabase/migrations/` and define the schema for users, documents, permissions, and audit logs.

#### Option A: Using the Supabase CLI
```bash
# Link your local project to Supabase
npx supabase link --project-ref your-project-ref

# Push migrations to the database
npx supabase db push
```

#### Option B: Direct SQL Execution
If configuring a custom PostgreSQL server or using the Supabase SQL Editor directly, execute the migration files in numerical order:
1. `supabase/migrations/20261020161206_create_trustvault_schema.sql`
2. `supabase/migrations/20261021100000_security_hardening.sql`
3. `supabase/migrations/20261021183000_align_users_supabase_auth.sql`
4. `supabase/migrations/20261022180000_audit_logs_actor_idx.sql`
5. `supabase/migrations/20261024000000_allow_user_role.sql`
6. `supabase/migrations/20261024100000_add_document_description.sql`

### Supabase Storage Bucket Configuration
1. Open your Supabase Dashboard and navigate to **Storage**.
2. Click **New bucket** and enter:
   - **Name:** `trustvault-private`
   - **Public bucket:** **OFF** (Ensure the bucket is strictly private).
3. Save the bucket.

### Bootstrapping an Administrator Account
To access the Administrative Audit Log console, provision an initial admin using the seed script:
```bash
ADMIN_EMAIL=admin@trustvault.local ADMIN_PASSWORD=YourSecurePassword123! npm run seed:admin --workspace=apps/api
```

---

## 10. Starting the Application

TrustVault includes npm scripts to run both applications concurrently or independently.

### Start the Full Development Environment
Open two terminal windows from the repository root:

**Terminal 1: Start Backend API**
```bash
npm run dev:api
# API server starts on http://localhost:4000
```

**Terminal 2: Start Frontend Application**
```bash
npm run dev:web
# Web app starts on http://localhost:5173
```

Open your browser and navigate to `http://localhost:5173` to access TrustVault.

### Frontend Vercel Deployment
To deploy the React + Vite frontend on Vercel:
1. Import the repository in Vercel and set the **Root Directory** to `apps/web` (critical for this monorepo).
2. Framework preset will automatically detect as **Vite** with output directory `dist`.
3. SPA client-side routing is handled via [`apps/web/vercel.json`](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/apps/web/vercel.json), ensuring direct navigation or page refreshes on `/dashboard`, `/settings`, or `/admin` serve `/index.html`.
4. Configure the required environment variables in the Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` (URL of your production backend API)

---

## 11. Testing & Verification Commands

All test suites can be executed from the repository root:

```bash
# Run all 240 automated tests via Vitest (9 test suites)
npm test

# Run TypeScript type-checking across apps/api and apps/web
npm run typecheck

# Run production builds for both apps
npm run build

# Run the full validation pipeline (typecheck + build + test)
npm run check

# Verify live PostgreSQL database connectivity
npm run db:check
```

For complete test suite descriptions and manual testing procedures, refer to [docs/TESTING.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/TESTING.md).

---

## 12. Authentication, Global Roles & Document Permissions

TrustVault implements a dual-layer security model separating **Global User Roles** from **Document-Level Permissions**:

### Global User Roles (`public.users.role`)

| Role | Intended Purpose & Capabilities | Restrictions & Boundaries |
|---|---|---|
| **`admin`** | System auditor & tenant administrator. Exclusive access to `GET /api/admin/audit-logs` for system-wide compliance oversight. | Cannot view or download arbitrary user documents without explicit document sharing; cannot bypass document security boundaries. |
| **`owner`** *(default)* | Standard document creator and custodian. Can upload new documents, manage owned documents, and grant/revoke sharing permissions. | Limited to documents they created (`documents.owner_id`) or documents explicitly shared with them. |
| **`viewer`** | Read-only collaborator. Can view and download documents explicitly shared with them. | **Strictly prohibited** from uploading new documents, modifying document metadata, deleting documents, or modifying sharing permissions. Direct API bypass attempts return `403 Forbidden`. |
| **`user`** *(legacy)* | Backward-compatible alias for existing accounts; mapped directly to `owner` behavior. | Safe database constraint `CHECK (role IN ('admin', 'owner', 'viewer', 'user'))` ensures zero disruption to existing accounts. |

### Document-Level Permissions (`document_permissions.permission`)

Regardless of global role, document access is governed per-document:

```
[Document Creator] (documents.owner_id = user.id)
  ├── Full Metadata CRUD & Versioning
  ├── Upload & File Download
  ├── Grant & Revoke Sharing Access
  ├── View Document Audit Logs
  └── Soft-Delete Document
        │
[Editor Grantee] (Shared with permission = 'edit')
  ├── View in Document Dashboard
  ├── Download Binary File
  └── Update Title, Category & Description
        │
[Reader Grantee] (Shared with permission = 'read')
  ├── View in Document Dashboard
  └── Download Binary File
```

> **Important Distinction:** A global `owner` role does **not** grant access to every document in the vault. Global `owner` means the user is capable of owning documents; their access remains strictly isolated to documents they created or were explicitly granted access to.

---

### Judge Demonstration Accounts

For hackathon evaluation and security verification, three demo accounts represent the distinct roles:

1. **Admin Demo:** `demo.admin@trustvault.local` (`role: admin`)
2. **Owner Demo:** `demo.owner@trustvault.local` (`role: owner`)
3. **Viewer Demo:** `demo.viewer@trustvault.local` (`role: viewer`)

#### Automated Setup Procedure
To prepare these accounts without committing credentials or secrets, configure the environment variables:

```bash
# Enable demo account seeding and supply individual passwords for each role (min 8 chars)
$env:ENABLE_DEMO_ACCOUNTS="true"
$env:DEMO_ADMIN_PASSWORD="AdminSecurePassword123!"
$env:DEMO_OWNER_PASSWORD="OwnerSecurePassword123!"
$env:DEMO_VIEWER_PASSWORD="ViewerSecurePassword123!"

npm run seed:judge-accounts
```

The seeding script (`apps/api/scripts/seed-judge-accounts.ts`):
- Verifies that `ENABLE_DEMO_ACCOUNTS=true` is explicitly set; refuses to run otherwise.
- Validates that all three distinct passwords (`DEMO_ADMIN_PASSWORD`, `DEMO_OWNER_PASSWORD`, `DEMO_VIEWER_PASSWORD`) are present and meet the 8-character minimum requirement before making any changes. Never falls back to hardcoded or shared passwords.
- Provisions each account idempotently in Supabase Auth via admin API and syncs with `public.users`.
- Assigns canonical roles (`admin`, `owner`, `viewer`) without touching unrelated users or downgrading existing accounts.
- Seeds an evaluation document (*TrustVault Security Evaluation Guide*) owned by the Owner and shared with the Viewer as `read`.
- Automatically exits with exit code 0 without printing passwords or secrets to logs.

#### Manual Setup Procedure (If Admin API is unavailable)
If automated Supabase provisioning credentials are not configured, follow this safe manual procedure:
1. Register three accounts via the UI registration page (`/register`) or Supabase Dashboard.
2. In the PostgreSQL database (via Supabase SQL Editor), assign their roles:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'demo.admin@trustvault.local';
   UPDATE public.users SET role = 'owner' WHERE email = 'demo.owner@trustvault.local';
   UPDATE public.users SET role = 'viewer' WHERE email = 'demo.viewer@trustvault.local';
   ```
3. Log in as `demo.owner@trustvault.local`, upload a sample PDF, and use the **Share** modal to share it with `demo.viewer@trustvault.local` with **Can view** (`read`) permission.

#### How Judges Can Verify Each Role

1. **Test Admin Demo (`demo.admin@trustvault.local`):**
   - Log in. Notice the sidebar contains **Admin Console** (`/admin`).
   - Navigate to `/admin`: view real-time system audit logs across all users.
   - Verify that non-admin accounts receive `403 Forbidden` if attempting to fetch `/api/admin/audit-logs`.

2. **Test Owner Demo (`demo.owner@trustvault.local`):**
   - Log in. Quick Upload and Upload Document buttons are visible and active.
   - Upload a new PDF or PNG document.
   - Edit metadata (title, category, description) and verify updates save.
   - Open the **Share** modal, grant `read` access to `demo.viewer@trustvault.local`, and test revoking access.
   - View document history and audit events in the document details.

3. **Test Viewer Demo (`demo.viewer@trustvault.local`):**
   - Log in. Notice the UI header badge displays **Viewer**.
   - The **Upload Document** buttons in header, sidebar, and dashboard are completely hidden.
   - The sample document shared by the Owner appears in the document list.
   - Click to view details and click **Download** to verify authorized read access.
   - Notice the three-dot action menu (Delete, Edit, Share) is absent.
   - **Verify Server-Side Enforcement:** Attempt to POST to `/api/documents` or PATCH/DELETE any document using the Viewer's session token. The API strictly rejects the request with `403 Forbidden` and logs a denied audit event (`actor_role: viewer`).

---

### Security Boundaries & Privilege Escalation Controls

- **Authentication:** Verified via Supabase Auth JWTs parsed and validated server-side.
- **Deactivated Accounts:** Any account flagged with `is_active: false` in `public.users` is immediately denied access with `403 Forbidden`.
- **Privilege Escalation Defense:** Profile update requests (`PATCH /api/me`) sanitize inputs; users cannot alter their own `role` or `is_active` status.
- **Registration Role Protection:** New user provisioning defaults to `owner`; users cannot supply a `role` during registration.
- **Non-Disclosure on Unauthorized Documents:** Unauthorized document access attempts return `404 Not Found` rather than `403 Forbidden` to prevent document ID enumeration.

---

## 13. Document Lifecycles & Workflows

### Upload Flow
1. User uploads a file via the **Upload Document** modal.
2. The file is validated for allowed MIME types and magic-byte signatures.
3. The file is uploaded to `trustvault-private` under a randomized server key: `private/${userId}/${uuid}.${ext}`.
4. An atomic SQL transaction records the document metadata and a `file:upload` audit log.
5. If the database commit fails, compensating cleanup deletes the newly uploaded storage object.

### Secure Download Flow
1. User requests `GET /api/documents/:id/download`.
2. The backend confirms the user has active access (`owner` or unrevoked `edit`/`read` grant).
3. If unauthorized or revoked, the backend returns `404 Not Found` (non-disclosure) and logs a denied audit event.
4. If authorized, the backend streams the file with `X-Content-Type-Options: nosniff` and an RFC 6266 / RFC 5987 sanitized `Content-Disposition` header.

### Sharing & Revocation Flow
1. Owner opens the **Share** modal and enters the collaborator's email.
2. Owner assigns `read` or `edit` permission.
3. To revoke, Owner clicks **Revoke**. The grant is updated with `revoked_at = now()` and an audit log is recorded.
4. Access is terminated **immediately**. The collaborator can no longer download or view the document.

For complete workflow instructions with screenshots and modal details, see [docs/USER_GUIDE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/USER_GUIDE.md).

---

## 14. Security Measures & Limitations

### Genuine Implemented Security Controls:
- **Server-Side Authorization:** Database queries strictly enforce permission boundaries independently of frontend state.
- **Non-Disclosure on Unauthorized Access:** Returns `404 Not Found` rather than `403 Forbidden` for inaccessible documents, mitigating document ID enumeration.
- **Private Object Storage:** Storage bucket is private; files are never exposed via public URLs.
- **Header Injection & Path Traversal Prevention:** Filenames are stripped of path separators (`/`, `\`), control characters, CR, and LF before header generation.
- **Upload Restrictions:** 10 MB limit and binary magic-byte inspection (PDF `%PDF-`, PNG, JPEG, WebP, UTF-8 clean text/CSV).
- **Transactional Audit Logging:** Mutations are committed atomically with their audit records.

### Known Limitations:
- **Client Antivirus:** File signature checks prevent MIME spoofing, but do not replace an active cloud antivirus or malware sandbox.
- **Distributed Rate Limiting:** The current rate limiter uses an in-memory store suitable for single-node deployments. Multi-instance production deployments require a Redis-backed store.
- **Revocation Boundary:** Access revocation blocks future downloads and views; files already downloaded to a user's physical device cannot be remotely recalled.

---

## 15. Troubleshooting Guide

### Issue: "Database connection unavailable" (503 on `/health`)
- Verify that PostgreSQL is running and accessible.
- Check that `DATABASE_URL` in `.env` is formatted correctly.
- Test connection using:
  ```bash
  npm run db:check
  ```

### Issue: "Supabase server configuration missing"
- Ensure both `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are defined in `.env`.
- Ensure you are using the **Service Role** key, not the Anon key, for `SUPABASE_SECRET_KEY`.

### Issue: Frontend displays "Supabase configuration missing"
- Verify that `.env` includes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Restart the Vite development server (`npm run dev:web`) to reload environment variables.

### Issue: File download fails with 404
- Verify that the document has an associated file (metadata-only records do not contain binary files).
- Verify that the storage bucket `trustvault-private` exists in your Supabase project.

---

## 16. Detailed Documentation Sitemap

| Document | Purpose |
|---|---|
| [THREATS.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/THREATS.md) | Comprehensive threat model (T1–T13), mitigations, and residual risks |
| [PROMPTS.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/PROMPTS.md) | AI assistance and development log across all phases (Entries 1–16) |
| [docs/API.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/API.md) | REST API endpoint reference, parameters, payloads, and responses |
| [docs/openapi.yaml](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/openapi.yaml) | Standard OpenAPI 3.0 specification for API clients and tooling |
| [docs/ARCHITECTURE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ARCHITECTURE.md) | Architectural design, request pipelines, and security specifications |
| [docs/USER_GUIDE.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/USER_GUIDE.md) | Step-by-step end-user guide for dashboard navigation and workflows |
| [docs/TESTING.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/TESTING.md) | Automated testing guide, test suites, and manual QA checklists |
| [docs/ENVIRONMENT.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/ENVIRONMENT.md) | Master environment variable matrix and security exposure rules |
| [docs/CHANGELOG.md](file:///c:/Users/tullu/OneDrive/Desktop/College/trustvault/docs/CHANGELOG.md) | Chronological development milestones across phases 1 through 10 |

---

## 17. Known Limitations & Future Improvements

1. **Redis Rate Limiting:** Replace in-memory rate limiting with Redis-backed distributed rate limiting for horizontal scaling.
2. **Virus Scanning Sandbox:** Integrate an asynchronous ClamAV or VirusTotal pipeline for uploaded file scanning.
3. **Multi-Factor Authentication (MFA):** Enable Supabase Auth TOTP/MFA for privileged document owners and administrators.
4. **Folder Organization:** Support nested folder hierarchies for enterprise document categorization.
5. **Direct Document Versioning:** Track file history and rollback points for updated document binaries.

---

## License

This project is licensed under the [MIT License](LICENSE).
