import "../env.js";
import { pool } from "./pool.js";

async function run() {
  try {
    console.log("Checking public.users table definition...");

    // Check columns
    const columnsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users';
    `);
    console.log("Columns:", columnsRes.rows.map(r => r.column_name));

    // Add full_name column if it does not exist
    const hasFullName = columnsRes.rows.some(r => r.column_name === "full_name");
    if (!hasFullName) {
      console.log("Adding full_name column to public.users...");
      await pool.query(`ALTER TABLE public.users ADD COLUMN full_name TEXT;`);
      console.log("Added full_name column.");
    }

    // Check constraints on public.users
    const constraintRes = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass;
    `);
    console.log("Constraints:", constraintRes.rows);

    // Update role check constraint to include 'user'
    for (const c of constraintRes.rows) {
      if (c.def.includes("role") && c.conname) {
        console.log(`Dropping constraint ${c.conname}...`);
        await pool.query(`ALTER TABLE public.users DROP CONSTRAINT "${c.conname}";`);
      }
    }

    console.log("Adding updated users_role_check constraint...");
    await pool.query(`
      ALTER TABLE public.users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('admin', 'user', 'owner', 'viewer'));
    `);

    // Update existing users who had role = 'owner' to 'user'
    const updateRes = await pool.query(`
      UPDATE public.users 
      SET role = 'user' 
      WHERE role = 'owner';
    `);
    console.log(`Updated ${updateRes.rowCount} users from 'owner' to 'user'.`);

    console.log("Migration completed successfully!");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
