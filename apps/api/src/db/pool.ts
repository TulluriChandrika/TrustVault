import "../env.js";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("=================================================================");
  console.error("FATAL CONFIGURATION ERROR: DATABASE_URL is not configured!");
  console.error("Please add DATABASE_URL in your hosting environment settings:");
  console.error("  - In Render: Dashboard -> Environment -> Add Environment Variable");
  console.error("    Key: DATABASE_URL");
  console.error("    Value: your remote Supabase PostgreSQL connection string");
  console.error("=================================================================");
  throw new Error("DATABASE_URL is not configured");
}

const isRemoteDb = Boolean(
  connectionString.includes("supabase.co") ||
  connectionString.includes("supabase.com") ||
  connectionString.includes("pooler.supabase.com") ||
  connectionString.includes("render.com") ||
  connectionString.includes("amazonaws.com") ||
  process.env.NODE_ENV === "production"
);

export const pool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (error: any) => {
  console.error(
    "Unexpected idle PostgreSQL connection error:",
    error.message
  );
});
