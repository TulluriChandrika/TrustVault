import "../src/env.js";
import { pool } from "../src/db/pool.js";
import { getSupabaseAdmin } from "../src/supabase.js";

async function seedAdmin() {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@trustvault.local").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      "[Admin Seed] ADMIN_PASSWORD environment variable is required (minimum 8 characters) to provision an administrator."
    );
  }

  console.log(`[Admin Seed] Starting controlled local admin provisioning for: ${adminEmail}`);

  const supabase = getSupabaseAdmin();

  // 1. Check if user already exists in Supabase Auth with pagination
  let authUserId: string | null = null;
  let existingAuthUser: any = null;
  let page = 1;
  const perPage = 50;

  while (true) {
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) {
      throw new Error(`Failed to query Supabase Auth users: ${listError.message}`);
    }

    const found = usersData.users.find(
      (u) => u.email?.toLowerCase() === adminEmail
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
    console.log(`[Admin Seed] Found existing Supabase Auth user (${existingAuthUser.id}). Updating password and confirming email...`);
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingAuthUser.id,
      {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: "Security Administrator",
          name: "Security Administrator",
        },
      }
    );
    if (updateError) {
      throw new Error(`Failed to update admin in Supabase Auth: ${updateError.message}`);
    }
    authUserId = existingAuthUser.id;
  } else {
    console.log(`[Admin Seed] Creating new administrator in Supabase Auth...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Security Administrator",
        name: "Security Administrator",
      },
    });
    if (createError || !newUser.user) {
      throw new Error(`Failed to create admin in Supabase Auth: ${createError?.message || "Unknown error"}`);
    }
    authUserId = newUser.user.id;
  }

  // 2. Synchronize and elevate role in public.users table strictly via server-side process
  const upsertQuery = `
    INSERT INTO public.users (id, email, full_name, password_hash, role, is_active)
    VALUES ($1, $2, 'Security Administrator', 'SUPABASE_AUTH_MANAGED', 'admin', true)
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        is_active = true,
        email = EXCLUDED.email,
        full_name = 'Security Administrator'
    RETURNING id, email, full_name, role, is_active;
  `;

  const dbRes = await pool.query(upsertQuery, [authUserId, adminEmail]);
  const provisioned = dbRes.rows[0];

  console.log(`[Admin Seed] Successfully provisioned local administrator!`);
  console.log({
    id: provisioned.id,
    email: provisioned.email,
    role: provisioned.role,
    is_active: provisioned.is_active,
  });
  console.log(`[Admin Seed] Provisioning complete for administrator account.`);
}

seedAdmin()
  .catch((err) => {
    console.error("[Admin Seed] Error provisioning admin:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
