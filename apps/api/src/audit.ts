import { PoolClient } from "pg";
import { pool } from "./db/pool.js";

export interface AuditLogEntry {
  actorId: string | null;
  documentId: string | null;
  action: string;
  outcome: "success" | "denied" | "failure";
  details?: Record<string, unknown>;
  client?: PoolClient;
}

/**
 * Records an immutable audit log entry in public.audit_logs.
 *
 * Consistency Policy:
 * 1. Transactional Mutations: When a mutation (create, edit, delete, grant, revoke) is executed,
 *    `client` must be provided. The audit entry is written inside the same SQL transaction.
 *    If the audit insertion fails (e.g., due to DB failure or trigger error), the entire
 *    transaction is rolled back, preventing any mutation from persisting without its audit trail.
 * 2. Non-transactional / Denied Events: When recording non-mutating events (read attempts,
 *    denied access where no transaction is open), `client` is omitted and `pool.query` is used.
 *    Any DB failure during standalone audit logging is trapped and logged to stderr to prevent
 *    crashing the response.
 */
export async function recordAuditLog({
  actorId,
  documentId,
  action,
  outcome,
  details = {},
  client,
}: AuditLogEntry): Promise<void> {
  const query = `
    INSERT INTO public.audit_logs (actor_id, document_id, action, outcome, details)
    VALUES ($1, $2, $3, $4, $5);
  `;
  const params = [
    actorId,
    documentId,
    action,
    outcome,
    JSON.stringify(details),
  ];

  if (client) {
    // If inside a transaction, let errors throw so the caller's transaction rolls back.
    await client.query(query, params);
  } else {
    // If standalone (e.g. access denied), catch errors safely.
    try {
      await pool.query(query, params);
    } catch (err: unknown) {
      console.error(
        "Failed to write standalone audit log:",
        err instanceof Error ? err.message : "Unknown database error"
      );
    }
  }
}
