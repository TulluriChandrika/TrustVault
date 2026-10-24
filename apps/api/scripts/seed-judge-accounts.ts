import "../src/env.js";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db/pool.js";
import { getSupabaseAdmin } from "../src/supabase.js";

export interface JudgeDemoEnv {
  ENABLE_DEMO_ACCOUNTS?: string;
  DEMO_ADMIN_PASSWORD?: string;
  DEMO_OWNER_PASSWORD?: string;
  DEMO_VIEWER_PASSWORD?: string;
  DEMO_ADMIN_EMAIL?: string;
  DEMO_OWNER_EMAIL?: string;
  DEMO_VIEWER_EMAIL?: string;
}

export interface ValidatedDemoConfig {
  adminEmail: string;
  ownerEmail: string;
  viewerEmail: string;
  adminPassword: string;
  ownerPassword: string;
  viewerPassword: string;
}

export interface AccountConfig {
  email: string;
  role: "admin" | "owner" | "viewer";
  fullName: string;
  password: string;
}

export function validatePassword(password: unknown, fieldName: string): string {
  if (typeof password !== "string" || !password.trim()) {
    throw new Error(`[Judge Demo Seed] ${fieldName} environment variable is required.`);
  }
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new Error(
      `[Judge Demo Seed] ${fieldName} must be at least 8 characters long to meet password security requirements.`
    );
  }
  return trimmed;
}

export function validateJudgeDemoConfig(env: Record<string, string | undefined> = process.env): ValidatedDemoConfig {
  const isEnabled = env.ENABLE_DEMO_ACCOUNTS?.trim().toLowerCase() === "true";
  if (!isEnabled) {
    throw new Error(
      "[Judge Demo Seed] Demo account seeding is disabled. Set ENABLE_DEMO_ACCOUNTS=true in environment to permit seeding demo accounts."
    );
  }

  const adminEmail = (env.DEMO_ADMIN_EMAIL || "demo.admin@trustvault.local").trim().toLowerCase();
  const ownerEmail = (env.DEMO_OWNER_EMAIL || "demo.owner@trustvault.local").trim().toLowerCase();
  const viewerEmail = (env.DEMO_VIEWER_EMAIL || "demo.viewer@trustvault.local").trim().toLowerCase();

  const adminPassword = validatePassword(env.DEMO_ADMIN_PASSWORD, "DEMO_ADMIN_PASSWORD");
  const ownerPassword = validatePassword(env.DEMO_OWNER_PASSWORD, "DEMO_OWNER_PASSWORD");
  const viewerPassword = validatePassword(env.DEMO_VIEWER_PASSWORD, "DEMO_VIEWER_PASSWORD");

  return {
    adminEmail,
    ownerEmail,
    viewerEmail,
    adminPassword,
    ownerPassword,
    viewerPassword,
  };
}

export async function findOrCreateAuthUser(
  supabase: any,
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  let page = 1;
  const perPage = 50;
  let existingAuthUser: any = null;

  while (true) {
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) {
      throw new Error(`Failed to query Supabase Auth users: ${listError.message}`);
    }

    const found = usersData.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (found) {
      existingAuthUser = found;
      break;
    }

    if (!usersData.users || usersData.users.length < perPage) {
      break;
    }
    page += 1;
  }

  if (existingAuthUser) {
    console.log(`[Judge Demo Seed] Updating existing Supabase Auth user: ${email} (${existingAuthUser.id})`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingAuthUser.id,
      {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          name: fullName,
        },
      }
    );
    if (updateError) {
      throw new Error(`Failed to update user in Supabase Auth (${email}): ${updateError.message}`);
    }
    return existingAuthUser.id;
  } else {
    console.log(`[Judge Demo Seed] Creating new Supabase Auth user: ${email}`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        name: fullName,
      },
    });
    if (createError || !newUser?.user) {
      throw new Error(`Failed to create user in Supabase Auth (${email}): ${createError?.message || "Unknown error"}`);
    }
    return newUser.user.id;
  }
}

export async function seedJudgeAccounts(options?: {
  env?: Record<string, string | undefined>;
  dbPool?: any;
  supabaseClient?: any;
}) {
  const env = options?.env || process.env;
  const config = validateJudgeDemoConfig(env);

  const activePool = options?.dbPool || pool;
  const supabase = options?.supabaseClient || getSupabaseAdmin();

  const accounts: AccountConfig[] = [
    {
      email: config.adminEmail,
      role: "admin",
      fullName: "Admin Demo",
      password: config.adminPassword,
    },
    {
      email: config.ownerEmail,
      role: "owner",
      fullName: "Owner Demo",
      password: config.ownerPassword,
    },
    {
      email: config.viewerEmail,
      role: "viewer",
      fullName: "Viewer Demo",
      password: config.viewerPassword,
    },
  ];

  console.log("[Demo Seed] Starting demo accounts provisioning...");

  const userIds: Record<string, string> = {};
  const provisionedUsers: Record<string, { id: string; email: string; role: string }> = {};

  for (const acc of accounts) {
    const authId = await findOrCreateAuthUser(supabase, acc.email, acc.password, acc.fullName);
    userIds[acc.role] = authId;

    // Synchronize into public.users with the exact role and active status
    const upsertQuery = `
      INSERT INTO public.users (id, email, full_name, password_hash, role, is_active)
      VALUES ($1, $2, $3, 'SUPABASE_AUTH_MANAGED', $4, true)
      ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          is_active = true,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name
      RETURNING id, email, full_name, role, is_active;
    `;

    const res = await activePool.query(upsertQuery, [authId, acc.email, acc.fullName, acc.role]);
    const row = res.rows[0];
    provisionedUsers[acc.role] = { id: row.id, email: row.email, role: row.role };
    console.log(`[Judge Demo Seed] Provisioned ${acc.fullName}: ${row.email} with global role '${row.role}'.`);
  }

  // 3. Seed demo documents and permissions to showcase owner and viewer roles
  const ownerId = userIds["owner"];
  const viewerId = userIds["viewer"];
  let createdOrExistingDocId: string | undefined;

  if (ownerId && viewerId) {
    const docTitle = "TrustVault_Security_Evaluation_Guide.pdf";
    const existingDocRes = await activePool.query(
      "SELECT id FROM public.documents WHERE owner_id = $1 AND title = $2 AND deleted_at IS NULL",
      [ownerId, docTitle]
    );

    let docId: string;

    if (existingDocRes.rows.length === 0) {
      console.log(`[Judge Demo Seed] Seeding demonstration document for Owner...`);
      const insertDocQuery = `
        INSERT INTO public.documents (owner_id, title, category, description, storage_key, mime_type, size_bytes)
        VALUES ($1, $2, 'Compliance', 'Confidential security evaluation guide for judge role demonstration', $3, 'application/pdf', 1048576)
        RETURNING id, title;
      `;
      const docRes = await activePool.query(insertDocQuery, [
        ownerId,
        docTitle,
        `raw/${crypto.randomUUID()}`,
      ]);
      docId = docRes.rows[0].id;

      await activePool.query(
        `INSERT INTO public.audit_logs (actor_id, document_id, action, outcome, details)
         VALUES ($1, $2, 'document:create', 'success', $3::jsonb)`,
        [ownerId, docId, JSON.stringify({ title: docTitle, category: "Compliance" })]
      );
      console.log(`[Judge Demo Seed] Created demonstration document: ${docTitle} (${docId})`);
    } else {
      docId = existingDocRes.rows[0].id;
      console.log(`[Judge Demo Seed] Existing demonstration document found: ${docTitle} (${docId})`);
    }
    createdOrExistingDocId = docId;

    const permRes = await activePool.query(
      "SELECT id, permission FROM public.document_permissions WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [docId, viewerId]
    );

    if (permRes.rows.length === 0) {
      console.log(`[Judge Demo Seed] Sharing document with Read-Only Viewer...`);
      await activePool.query(
        `INSERT INTO public.document_permissions (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, 'read', $3)`,
        [docId, viewerId, ownerId]
      );

      await activePool.query(
        `INSERT INTO public.audit_logs (actor_id, document_id, action, outcome, details)
         VALUES ($1, $2, 'permission:grant', 'success', $3::jsonb)`,
        [
          ownerId,
          docId,
          JSON.stringify({
            targetUserId: viewerId,
            targetEmail: config.viewerEmail,
            permission: "read",
          }),
        ]
      );
      console.log(`[Judge Demo Seed] Granted 'read' permission to ${config.viewerEmail}.`);
    } else {
      console.log(`[Judge Demo Seed] Read-Only Viewer already has active permission grant on demonstration document.`);
    }
  }

  console.log(`\n=======================================================`);
  console.log(`[Demo Seed] All 3 demo accounts are configured!`);
  console.log(`1. Admin Demo:   ${config.adminEmail} (Role: admin)`);
  console.log(`2. Owner Demo:   ${config.ownerEmail} (Role: owner)`);
  console.log(`3. Viewer Demo:  ${config.viewerEmail} (Role: viewer)`);
  console.log(`=======================================================\n`);

  return {
    admin: provisionedUsers["admin"],
    owner: provisionedUsers["owner"],
    viewer: provisionedUsers["viewer"],
    documentId: createdOrExistingDocId,
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath && (invokedPath === currentFilePath || invokedPath.endsWith("seed-judge-accounts.ts"))) {
  seedJudgeAccounts()
    .catch((err) => {
      console.error("[Judge Demo Seed] Error seeding accounts:", err?.message || err);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end();
    });
}
