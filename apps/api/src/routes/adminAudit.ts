import { Router, Request, Response } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { isValidUUID } from "../utils/validation.js";

export const adminAuditRouter = Router();

// Protect all administrative audit routes with authentication and strict admin role check
adminAuditRouter.use(requireAuth);
adminAuditRouter.use(requireAdmin);

const VALID_OUTCOMES = new Set(["success", "denied", "failure"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/audit-logs
 *
 * Query parameters:
 * - limit: number of records to return (1..100, default: 50)
 * - offset: number of records to skip (>= 0, default: 0)
 * - actor_id: UUID of the actor
 * - document_id: UUID of the document
 * - action: string (1..100 characters)
 * - outcome: 'success' | 'denied' | 'failure'
 * - start_date: ISO 8601 timestamp (inclusive)
 * - end_date: ISO 8601 timestamp (inclusive)
 *
 * All filters are validated and parameterized.
 * Stable ordering is enforced: created_at DESC, id DESC.
 */
adminAuditRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const query = req.query;

  // 1. Validate pagination parameters
  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const rawLimit = String(query.limit).trim();
    if (!/^[1-9]\d*$/.test(rawLimit) || rawLimit.length > 3) {
      res.status(400).json({ error: "Limit must be an integer between 1 and 100" });
      return;
    }
    limit = parseInt(rawLimit, 10);
    if (limit < 1 || limit > MAX_LIMIT) {
      res.status(400).json({ error: "Limit must be an integer between 1 and 100" });
      return;
    }
  }

  let offset = 0;
  if (query.offset !== undefined) {
    const rawOffset = String(query.offset).trim();
    // Validate canonical non-negative integer representation
    if (!/^(0|[1-9]\d*)$/.test(rawOffset)) {
      res.status(400).json({ error: "Offset must be a non-negative integer within safe limits" });
      return;
    }
    // Check digit length and compare with Number.MAX_SAFE_INTEGER (9007199254740991)
    if (rawOffset.length > 16 || BigInt(rawOffset) > BigInt(Number.MAX_SAFE_INTEGER)) {
      res.status(400).json({ error: "Offset must be a non-negative integer within safe limits" });
      return;
    }
    offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      res.status(400).json({ error: "Offset must be a non-negative integer within safe limits" });
      return;
    }
  }

  // 2. Validate filter parameters
  let actorId: string | undefined;
  if (query.actor_id !== undefined) {
    const rawActor = String(query.actor_id).trim();
    if (!isValidUUID(rawActor)) {
      res.status(400).json({ error: "Invalid actor_id. Must be a valid UUID" });
      return;
    }
    actorId = rawActor;
  }

  let documentId: string | undefined;
  if (query.document_id !== undefined) {
    const rawDoc = String(query.document_id).trim();
    if (!isValidUUID(rawDoc)) {
      res.status(400).json({ error: "Invalid document_id. Must be a valid UUID" });
      return;
    }
    documentId = rawDoc;
  }

  let action: string | undefined;
  if (query.action !== undefined) {
    const rawAction = String(query.action).trim();
    if (rawAction.length < 1 || rawAction.length > 100) {
      res.status(400).json({ error: "Action must be between 1 and 100 characters" });
      return;
    }
    action = rawAction;
  }

  let outcome: string | undefined;
  if (query.outcome !== undefined) {
    const rawOutcome = String(query.outcome).trim().toLowerCase();
    if (!VALID_OUTCOMES.has(rawOutcome)) {
      res.status(400).json({ error: "Invalid outcome. Must be 'success', 'denied', or 'failure'" });
      return;
    }
    outcome = rawOutcome;
  }

  let startDate: Date | undefined;
  if (query.start_date !== undefined) {
    const rawStartDate = String(query.start_date).trim();
    const parsed = Date.parse(rawStartDate);
    if (isNaN(parsed)) {
      res.status(400).json({ error: "Invalid start_date. Must be a valid ISO 8601 timestamp" });
      return;
    }
    startDate = new Date(parsed);
  }

  let endDate: Date | undefined;
  if (query.end_date !== undefined) {
    const rawEndDate = String(query.end_date).trim();
    const parsed = Date.parse(rawEndDate);
    if (isNaN(parsed)) {
      res.status(400).json({ error: "Invalid end_date. Must be a valid ISO 8601 timestamp" });
      return;
    }
    endDate = new Date(parsed);
  }

  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ error: "start_date cannot be after end_date" });
    return;
  }

  // 3. Construct parameterized SQL query
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (actorId) {
    params.push(actorId);
    conditions.push(`actor_id = $${params.length}`);
  }

  if (documentId) {
    params.push(documentId);
    conditions.push(`document_id = $${params.length}`);
  }

  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }

  if (outcome) {
    params.push(outcome);
    conditions.push(`outcome = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate.toISOString());
    conditions.push(`created_at >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate.toISOString());
    conditions.push(`created_at <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // Total count query with exact same WHERE conditions
    const countSql = `
      SELECT COUNT(*)::bigint AS total
      FROM public.audit_logs
      ${whereClause};
    `;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Data query with parameterized LIMIT and OFFSET
    const dataParams = [...params];
    dataParams.push(limit);
    const limitPlaceholder = `$${dataParams.length}`;
    dataParams.push(offset);
    const offsetPlaceholder = `$${dataParams.length}`;

    const dataSql = `
      SELECT 
        id,
        actor_id,
        document_id,
        action,
        outcome,
        details,
        created_at
      FROM public.audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;

    const dataResult = await pool.query(dataSql, dataParams);
    const hasMore = offset + dataResult.rows.length < total;

    res.json({
      audit_logs: dataResult.rows,
      pagination: {
        total,
        limit,
        offset,
        has_more: hasMore,
      },
    });
  } catch (err: unknown) {
    console.error("Failed to query audit logs:", err);
    res.status(500).json({ error: "Failed to retrieve audit logs" });
  }
});

/**
 * GET /api/admin/audit-logs/:id
 * Retrieve a single audit event by ID.
 * Returns 400 for malformed IDs or values outside PostgreSQL signed BIGINT range (1..9223372036854775807),
 * and 404 if the record does not exist.
 */
adminAuditRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  // Accept only positive canonical decimal integers (1..9223372036854775807, no leading zeros or zero)
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
    res.status(400).json({ error: "Invalid audit log ID format. Expected a positive integer within valid range" });
    return;
  }

  // PostgreSQL signed BIGINT maximum is 9223372036854775807 (19 digits)
  if (id.length > 19 || BigInt(id) > 9223372036854775807n) {
    res.status(400).json({ error: "Invalid audit log ID format. Expected a positive integer within valid range" });
    return;
  }

  try {
    const query = `
      SELECT 
        id,
        actor_id,
        document_id,
        action,
        outcome,
        details,
        created_at
      FROM public.audit_logs
      WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Audit log entry not found" });
      return;
    }

    res.json({ audit_log: result.rows[0] });
  } catch (err: unknown) {
    console.error("Failed to fetch audit log entry:", err);
    res.status(500).json({ error: "Failed to retrieve audit log entry" });
  }
});
