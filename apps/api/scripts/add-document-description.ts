import "../src/env.js";
import { pool } from "../src/db/pool.js";

async function run() {
  try {
    console.log("Checking columns on public.documents...");
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'documents';
    `);
    const cols = res.rows.map(r => r.column_name);
    console.log("Existing columns:", cols);

    if (!cols.includes("description")) {
      console.log("Adding description column to public.documents...");
      await pool.query(`ALTER TABLE public.documents ADD COLUMN description TEXT;`);
      console.log("Added description column.");
    } else {
      console.log("Column description already exists.");
    }
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
