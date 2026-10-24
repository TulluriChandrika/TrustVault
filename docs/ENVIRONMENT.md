# TrustVault — Environment Configuration Guide

This document provides a comprehensive reference for all environment variables used in TrustVault across the Express API backend and Vite React frontend.

---

## 1. Security Principles for Environment Variables

1. **Server vs. Client Separation:**
   - **Backend variables** (e.g., `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`) are read exclusively by the Node.js/Express server and runtime processes. They must **never** be shared, bundled into the frontend, or prefixed with `VITE_`.
   - **Frontend variables** prefixed with `VITE_` (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) are compiled directly into the client-side JavaScript bundle by Vite at build time. Anyone visiting the website can view these values in their browser. **Never put service-role keys, database credentials, or server secrets in `VITE_` variables.**

2. **No Real Secrets in Version Control:**
   - The `.env` file is excluded from Git via `.gitignore`.
   - Never commit `.env` or paste live API keys, database connection strings, or service-role tokens into documentation, pull requests, or issue trackers.
   - Use `.env.example` as a template with placeholder values.

---

## 2. Master Environment Variables Matrix

| Variable Name | Consumer | Required | Default / Fallback | Client Exposed? | Description & Purpose |
|---|---|---|---|---|---|
| `NODE_ENV` | Backend (`apps/api`) | Optional | `development` | No | Application environment (`development`, `production`, `test`). Controls logging verbosity and test isolation. |
| `PORT` | Backend (`apps/api`) | Optional | `4000` | No | Port on which the Express HTTP server listens. |
| `DATABASE_URL` | Backend (`apps/api`) | **Yes** | *None* | No | PostgreSQL connection URI for `pg.Pool`. Supports local Postgres or Supabase Connection Pooler (`postgresql://...`). |
| `FRONTEND_ORIGIN` | Backend (`apps/api`) | Optional | `http://localhost:5173` | No | Allowed frontend origin for CORS. Trailing slashes are stripped automatically. Localhost and 127.0.0.1 are also permitted. |
| `SESSION_SECRET` | Backend (`apps/api`) | Optional | *None* | No | Random secret string reserved for session signature derivation. |
| `SUPABASE_URL` | Backend (`apps/api`) | **Yes** | *None* | No | Fully qualified URL of the Supabase project (e.g., `https://xyzcompany.supabase.co`). Required for server-side token verification and storage API calls. |
| `SUPABASE_SECRET_KEY` | Backend (`apps/api`) | **Yes** | *None* | **STRICTLY PRIVATE** | Supabase **Service Role** key (`eyJ...`). Grants administrative rights to verify tokens (`supabase.auth.getUser`) and manage private storage without client RLS restrictions. **Never expose to client.** |
| `STORAGE_BUCKET_NAME` | Backend (`apps/api`) | Optional | `trustvault-private` | No | Name of the private Supabase Storage bucket where encrypted/private document objects are uploaded and downloaded. |
| `TRUST_PROXY` | Backend (`apps/api`) | Optional | *None* | No | Set to `"1"` (or proxy hop count) when running behind a reverse proxy (e.g., NGINX, Cloudflare) so `express-rate-limit` reads the client IP from `X-Forwarded-For`. |
| `ADMIN_EMAIL` | Backend CLI (`seed-admin.ts`) | Optional | `admin@trustvault.local` | No | Target email address when running `npm run seed:admin` to bootstrap or promote a security administrator. |
| `ADMIN_PASSWORD` | Backend CLI (`seed-admin.ts`) | Required for script | *None* | No | Initial password (min 8 characters) supplied when running the local admin seed script. |
| `ENABLE_DEMO_ACCOUNTS` | Backend CLI (`seed-judge-accounts.ts`) | Required for seed | *None* | No | Must be set to `true` to allow executing `npm run seed:judge-accounts`. Refuses to run if false or omitted. |
| `DEMO_ADMIN_PASSWORD` | Backend CLI (`seed-judge-accounts.ts`) | Required for seed | *None* | No | Dedicated password (min 8 characters) for `demo.admin@trustvault.local` (`admin` role). |
| `DEMO_OWNER_PASSWORD` | Backend CLI (`seed-judge-accounts.ts`) | Required for seed | *None* | No | Dedicated password (min 8 characters) for `demo.owner@trustvault.local` (`owner` role). |
| `DEMO_VIEWER_PASSWORD` | Backend CLI (`seed-judge-accounts.ts`) | Required for seed | *None* | No | Dedicated password (min 8 characters) for `demo.viewer@trustvault.local` (`viewer` role). |
| `VITE_SUPABASE_URL` | Frontend (`apps/web`) | **Yes** | *Placeholder* | **Yes (Public)** | Public Supabase project URL used by the client-side Supabase Auth SDK in the browser. |
| `VITE_SUPABASE_ANON_KEY` | Frontend (`apps/web`) | **Yes** | *Placeholder* | **Yes (Public)** | Public Supabase **Anonymous** (`anon`) public key (`eyJ...`). Safe for browser distribution. Governed by Supabase Auth policies. |
| `VITE_API_URL` | Frontend (`apps/web`) | Optional | `""` (relative `/api`) | **Yes (Public)** | Base URL of the TrustVault Express API. If omitted or empty, the frontend uses relative requests (`/api/...`), which Vite proxies to `http://localhost:4000` in dev. |

---

## 3. Configuration Profiles

### 3.1 Local Development (`.env` in repository root)

Create a `.env` file in the repository root by copying `.env.example`:

```bash
# Copy example template
cp .env.example .env
```

Sanitized example configuration:

```env
# -----------------------------------------------------------------------------
# TrustVault - Local Development Environment Configuration Template
# -----------------------------------------------------------------------------

NODE_ENV=development
PORT=4000

# PostgreSQL Connection String (local PostgreSQL or Supabase direct connection)
DATABASE_URL=postgresql://postgres:your_local_password@localhost:54322/postgres

# Frontend URL for CORS authorization
FRONTEND_ORIGIN=http://localhost:5173

# Random string for server cryptographic entropy
SESSION_SECRET=dev-session-secret-change-in-production-min32chars

# --- Supabase Server Configuration (Strictly Server-Side) ---
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key-here
STORAGE_BUCKET_NAME=trustvault-private

# --- Frontend Client Configuration (Vite Browser App) ---
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key-here
VITE_API_URL=http://localhost:4000

# Optional Reverse Proxy Setting
# TRUST_PROXY=1

# --- Judge Demo Accounts (optional - for local testing and judge evaluation) ---
ENABLE_DEMO_ACCOUNTS=true
DEMO_ADMIN_PASSWORD=your_admin_demo_password_min8chars
DEMO_OWNER_PASSWORD=your_owner_demo_password_min8chars
DEMO_VIEWER_PASSWORD=your_viewer_demo_password_min8chars
```

### 3.2 Production Deployment Guidelines

When preparing for production:

1. **Database Connection:** Use a pooled connection string with SSL enabled (`sslmode=require`), typically provided by Supabase or cloud PostgreSQL providers (AWS RDS, Neon).
2. **Supabase Secrets:** Retrieve the `service_role` secret directly from the Supabase Dashboard under **Project Settings > API**. Configure it as an environment variable in your production hosting platform (e.g., Render, Railway, AWS ECS, Fly.io).
3. **Frontend Origin:** Set `FRONTEND_ORIGIN` to the production domain (e.g., `https://trustvault.yourdomain.com`).
4. **Vite API URL:** Set `VITE_API_URL` to your production backend API domain (e.g., `https://api.trustvault.yourdomain.com`) or leave it empty if the frontend and API share a common reverse-proxy domain.
5. **Reverse Proxy:** If deploying behind Cloudflare, AWS ALB, or an NGINX ingress controller, set `TRUST_PROXY=1` so IP-based rate limiting functions accurately.

#### 3.2.1 Frontend Deployment on Vercel
When deploying the frontend SPA to Vercel:
- **Root Directory:** Set to `apps/web` in the Vercel project settings (critical for monorepo configuration).
- **Framework Preset:** Vite
- **Build Command:** `npm run build` (or `tsc && vite build`)
- **Output Directory:** `dist`
- **SPA Rewrites (`apps/web/vercel.json`):**
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```
- **Environment Variables on Vercel:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL` (points to your deployed Express backend)

---

## 4. Verification and Troubleshooting

- **Check Database Connectivity:**
  ```bash
  npm run db:check
  ```
- **Check Server Environment Loading:**
  The backend loader (`apps/api/src/env.ts`) automatically resolves `.env` from the current working directory, workspace root, or parent directory. If variables fail to load, ensure the `.env` file is present in the repository root.
- **Frontend Configuration Warning:**
  If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are unset, `apps/web/src/lib/supabase.ts` detects the missing variables and displays an amber configuration warning banner on the login/signup screens.
