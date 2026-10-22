import { Router, Request, Response } from "express";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { recordAuditLog } from "../audit.js";
import { isValidUUID, sanitizeString } from "../utils/validation.js";

export const documentsRouter = Router();

// Enforce Phase 4 authentication on all document routes
documentsRouter.use(requireAuth);

interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  mime_type: string;
  size_bytes: string | number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  access_level: "owner" | "edit" | "read" | null;
}

/**
 * Helper to fetch a document and verify the caller's active access level.
 * Returns null if the document does not exist or has been soft-deleted.
 */
async function getDocumentWithAccess(
  documentId: string,
  userId: string
): Promise<DocumentRow | null> {
  const query = `
    SELECT 
      d.id,
      d.owner_id,
      d.title,
      d.category,
      d.mime_type,
      d.size_bytes,
      d.created_at,
      d.updated_at,
      d.deleted_at,
      CASE 
        WHEN d.owner_id = $1 THEN 'owner'
        ELSE p.permission
      END AS access_level
    FROM public.documents d
    LEFT JOIN public.document_permissions p 
      ON d.id = p.document_id 
      AND p.user_id = $1 
      AND p.revoked_at IS NULL
    WHERE d.id = $2 AND d.deleted_at IS NULL;
  `;

  const result = await pool.query(query, [userId, documentId]);
  return result.rows[0] || null;
}

/**
 * GET /api/documents
 * List all active documents owned by or actively shared with the authenticated user.
 */
documentsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    const query = `
      SELECT 
        d.id,
        d.owner_id,
        d.title,
        d.category,
        d.mime_type,
        d.size_bytes,
        d.created_at,
        d.updated_at,
        CASE 
          WHEN d.owner_id = $1 THEN 'owner'
          ELSE p.permission
        END AS access_level
      FROM public.documents d
      LEFT JOIN public.document_permissions p 
        ON d.id = p.document_id 
        AND p.user_id = $1 
        AND p.revoked_at IS NULL
      WHERE d.deleted_at IS NULL
        AND (d.owner_id = $1 OR p.id IS NOT NULL)
      ORDER BY d.created_at DESC;
    `;

    const result = await pool.query(query, [userId]);
    res.json({ documents: result.rows });
  } catch (err: unknown) {
    console.error("Error listing documents:", err);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

/**
 * POST /api/documents
 * Create document metadata owned by the authenticated user.
 * Note: Phase 5 is metadata-only; actual file upload/storage belongs to Phase 6.
 */
documentsRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const body = req.body || {};

  // Reject client-supplied immutable or internal fields
  const forbiddenFields = [
    "id",
    "owner_id",
    "storage_key",
    "created_at",
    "updated_at",
    "deleted_at",
  ];
  for (const field of forbiddenFields) {
    if (field in body) {
      res.status(400).json({ error: `Field '${field}' cannot be specified by client` });
      return;
    }
  }

  const title = sanitizeString(body.title);
  const category = sanitizeString(body.category);

  if (!title || title.length < 1 || title.length > 200) {
    res.status(400).json({ error: "Title is required and must be between 1 and 200 characters" });
    return;
  }

  if (!category || category.length < 1 || category.length > 100) {
    res.status(400).json({ error: "Category is required and must be between 1 and 100 characters" });
    return;
  }

  // Schema compatibility contract for Phase 5:
  // mime_type and size_bytes are required non-null in DB schema from Migration 1.
  const mimeType = sanitizeString(body.mime_type) || "application/octet-stream";
  let sizeBytes = typeof body.size_bytes === "number" ? body.size_bytes : 1;
  if (sizeBytes <= 0) {
    sizeBytes = 1;
  }

  // Server-generated unique storage key (never client-chosen)
  const storageKey = `raw/${crypto.randomUUID()}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertQuery = `
      INSERT INTO public.documents (owner_id, title, category, storage_key, mime_type, size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, owner_id, title, category, mime_type, size_bytes, created_at, updated_at;
    `;

    const result = await client.query(insertQuery, [
      userId,
      title,
      category,
      storageKey,
      mimeType,
      sizeBytes,
    ]);

    const createdDoc = result.rows[0];

    // Transactional audit log insertion
    await recordAuditLog({
      actorId: userId,
      documentId: createdDoc.id,
      action: "document:create",
      outcome: "success",
      details: { title, category },
      client,
    });

    await client.query("COMMIT");

    res.status(201).json({
      document: {
        ...createdDoc,
        access_level: "owner",
      },
    });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    console.error("Error creating document:", err);
    res.status(500).json({ error: "Failed to create document metadata" });
  } finally {
    client.release();
  }
});

/**
 * GET /api/documents/:id
 * Retrieve metadata for a single document if caller is owner, editor, or reader.
 */
documentsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      // Record denied audit attempt (without leaking existence)
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "document:read",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });

      res.status(404).json({ error: "Document not found" });
      return;
    }

    // Record success audit
    await recordAuditLog({
      actorId: userId,
      documentId: doc.id,
      action: "document:read",
      outcome: "success",
    });

    res.json({
      document: {
        id: doc.id,
        owner_id: doc.owner_id,
        title: doc.title,
        category: doc.category,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        access_level: doc.access_level,
      },
    });
  } catch (err: unknown) {
    console.error("Error retrieving document:", err);
    res.status(500).json({ error: "Failed to retrieve document" });
  }
});

/**
 * PATCH /api/documents/:id
 * Update allowed metadata (title, category). Allowed for owner and active editors.
 */
documentsRouter.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;
  const body = req.body || {};

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  // Reject immutable fields
  const immutableFields = [
    "id",
    "owner_id",
    "storage_key",
    "mime_type",
    "size_bytes",
    "created_at",
    "updated_at",
    "deleted_at",
  ];
  for (const field of immutableFields) {
    if (field in body) {
      res.status(400).json({ error: `Field '${field}' is immutable and cannot be updated` });
      return;
    }
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "document:update",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.access_level === "read") {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "document:update",
        outcome: "denied",
        details: { reason: "insufficient_read_only_permission" },
      });
      res.status(403).json({ error: "Insufficient permissions: read-only users cannot edit document metadata" });
      return;
    }

    // Only owner or editor reach here
    const hasTitle = "title" in body;
    const hasCategory = "category" in body;

    if (!hasTitle && !hasCategory) {
      res.status(400).json({ error: "At least one editable field ('title' or 'category') must be provided" });
      return;
    }

    let newTitle: string | null = null;
    if (hasTitle) {
      newTitle = sanitizeString(body.title);
      if (!newTitle || newTitle.length < 1 || newTitle.length > 200) {
        res.status(400).json({ error: "Title must be between 1 and 200 characters" });
        return;
      }
    }

    let newCategory: string | null = null;
    if (hasCategory) {
      newCategory = sanitizeString(body.category);
      if (!newCategory || newCategory.length < 1 || newCategory.length > 100) {
        res.status(400).json({ error: "Category must be between 1 and 100 characters" });
        return;
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Atomically check authorization and update in a single conditional statement:
      // Caller must either be the document owner OR have an active 'edit' permission.
      // And the document must not be soft-deleted.
      const updateQuery = `
        UPDATE public.documents d
        SET title = COALESCE($1, d.title),
            category = COALESCE($2, d.category)
        WHERE d.id = $3 
          AND d.deleted_at IS NULL
          AND (
            d.owner_id = $4
            OR EXISTS (
              SELECT 1 FROM public.document_permissions p
              WHERE p.document_id = d.id 
                AND p.user_id = $4 
                AND p.permission = 'edit' 
                AND p.revoked_at IS NULL
            )
          )
        RETURNING d.id, d.owner_id, d.title, d.category, d.mime_type, d.size_bytes, d.created_at, d.updated_at;
      `;

      const result = await client.query(updateQuery, [newTitle, newCategory, documentId, userId]);
      const updatedDoc = result.rows[0];

      if (!updatedDoc) {
        await client.query("ROLLBACK");
        await recordAuditLog({
          actorId: userId,
          documentId,
          action: "document:update",
          outcome: "denied",
          details: { reason: "concurrently_revoked_or_deleted" },
        });
        res.status(403).json({ error: "Insufficient permissions or document is no longer active" });
        return;
      }

      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "document:update",
        outcome: "success",
        details: {
          updatedFields: {
            ...(newTitle !== null ? { title: newTitle } : {}),
            ...(newCategory !== null ? { category: newCategory } : {}),
          },
        },
        client,
      });

      await client.query("COMMIT");

      res.json({
        document: {
          ...updatedDoc,
          access_level: doc.access_level,
        },
      });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      console.error("Error updating document:", err);
      res.status(500).json({ error: "Failed to update document metadata" });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("Error processing document update:", err);
    res.status(500).json({ error: "Failed to process document update" });
  }
});

/**
 * DELETE /api/documents/:id
 * Soft-delete a document record. Restricted strictly to the document owner.
 */
documentsRouter.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "document:delete",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.access_level !== "owner") {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "document:delete",
        outcome: "denied",
        details: { reason: "non_owner_delete_attempt", callerAccess: doc.access_level },
      });
      res.status(403).json({ error: "Only the document owner can delete this document" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const deleteResult = await client.query(
        "UPDATE public.documents SET deleted_at = now() WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL RETURNING id;",
        [documentId, userId]
      );

      if (deleteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        await recordAuditLog({
          actorId: userId,
          documentId,
          action: "document:delete",
          outcome: "denied",
          details: { reason: "concurrently_deleted_or_unauthorized" },
        });
        res.status(404).json({ error: "Document not found" });
        return;
      }

      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "document:delete",
        outcome: "success",
        client,
      });

      await client.query("COMMIT");

      res.json({ message: "Document deleted successfully" });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      console.error("Error soft-deleting document:", err);
      res.status(500).json({ error: "Failed to delete document" });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("Error in delete route:", err);
    res.status(500).json({ error: "Failed to process delete request" });
  }
});

/**
 * GET /api/documents/:id/permissions
 * List current active permission grants for a document. Restricted to document owner.
 */
documentsRouter.get("/:id/permissions", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "permission:list",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.access_level !== "owner") {
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "permission:list",
        outcome: "denied",
        details: { reason: "non_owner_permission_list_attempt" },
      });
      res.status(403).json({ error: "Only the document owner can view permissions" });
      return;
    }

    const query = `
      SELECT 
        p.id,
        p.document_id,
        p.user_id,
        u.email AS user_email,
        p.permission,
        p.granted_by,
        p.granted_at
      FROM public.document_permissions p
      JOIN public.users u ON p.user_id = u.id
      WHERE p.document_id = $1 AND p.revoked_at IS NULL
      ORDER BY p.granted_at DESC;
    `;

    const result = await pool.query(query, [documentId]);
    res.json({ permissions: result.rows });
  } catch (err: unknown) {
    console.error("Error listing permissions:", err);
    res.status(500).json({ error: "Failed to list document permissions" });
  }
});

/**
 * POST /api/documents/:id/permissions
 * Grant 'read' or 'edit' permission to an active TrustVault user. Restricted to document owner.
 */
documentsRouter.post("/:id/permissions", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;
  const body = req.body || {};

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "permission:grant",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.access_level !== "owner") {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "permission:grant",
        outcome: "denied",
        details: { reason: "non_owner_grant_attempt", callerAccess: doc.access_level },
      });
      res.status(403).json({ error: "Only the document owner can grant permissions" });
      return;
    }

    // Validate permission type
    const permission = body.permission;
    if (permission !== "read" && permission !== "edit") {
      res.status(400).json({ error: "Invalid permission: must be 'read' or 'edit'" });
      return;
    }

    // Resolve target user by user_id or email
    const targetUserId = body.user_id;
    const targetEmail = sanitizeString(body.email);

    if (!targetUserId && !targetEmail) {
      res.status(400).json({ error: "Target 'user_id' or 'email' is required" });
      return;
    }

    let targetUserQuery = "SELECT id, email, is_active FROM public.users WHERE ";
    const queryParams: any[] = [];
    if (targetUserId) {
      if (!isValidUUID(targetUserId)) {
        res.status(400).json({ error: "Invalid target user ID format" });
        return;
      }
      targetUserQuery += "id = $1";
      queryParams.push(targetUserId);
    } else {
      targetUserQuery += "email = $1";
      queryParams.push(targetEmail);
    }

    const targetUserResult = await pool.query(targetUserQuery, queryParams);
    const targetUser = targetUserResult.rows[0];

    if (!targetUser || !targetUser.is_active) {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "permission:grant",
        outcome: "denied",
        details: { reason: "target_not_found_or_inactive" },
      });
      res.status(404).json({ error: "Target user not found or not eligible" });
      return;
    }

    if (targetUser.id === userId || targetUser.id === doc.owner_id) {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "permission:grant",
        outcome: "denied",
        details: { reason: "self_grant_prohibited", targetUserId: targetUser.id },
      });
      res.status(400).json({ error: "Cannot grant permissions to yourself or the document owner" });
      return;
    }

    // Check for existing active permission grant
    const activeCheck = await pool.query(
      "SELECT id, permission FROM public.document_permissions WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [documentId, targetUser.id]
    );

    if (activeCheck.rows.length > 0) {
      res.status(409).json({
        error:
          "User already has an active permission grant for this document. Revoke the existing grant before changing permission levels.",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertQuery = `
        INSERT INTO public.document_permissions (document_id, user_id, permission, granted_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, document_id, user_id, permission, granted_by, granted_at;
      `;

      const grantResult = await client.query(insertQuery, [
        documentId,
        targetUser.id,
        permission,
        userId,
      ]);
      const createdGrant = grantResult.rows[0];

      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "permission:grant",
        outcome: "success",
        details: {
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          permission,
        },
        client,
      });

      await client.query("COMMIT");

      res.status(201).json({
        permission: {
          ...createdGrant,
          user_email: targetUser.email,
        },
      });
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({
          error:
            "User already has an active permission grant for this document. Revoke the existing grant before changing permission levels.",
        });
        return;
      }
      console.error("Error granting permission:", err);
      res.status(500).json({ error: "Failed to grant document permission" });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error("Error in grant permission route:", err);
    res.status(500).json({ error: "Failed to process permission grant" });
  }
});

/**
 * DELETE /api/documents/:id/permissions/:userId
 * Revoke an active permission grant. Restricted strictly to the document owner.
 */
documentsRouter.delete(
  "/:id/permissions/:userId",
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const documentId = req.params.id;
    const targetUserId = req.params.userId;

    if (!isValidUUID(documentId) || !isValidUUID(targetUserId)) {
      res.status(400).json({ error: "Invalid UUID format" });
      return;
    }

    try {
      const doc = await getDocumentWithAccess(documentId, userId);

      if (!doc || !doc.access_level) {
        await recordAuditLog({
          actorId: userId,
          documentId,
          action: "permission:revoke",
          outcome: "denied",
          details: { reason: "not_found_or_unauthorized" },
        });
        res.status(404).json({ error: "Document not found" });
        return;
      }

      if (doc.access_level !== "owner") {
        await recordAuditLog({
          actorId: userId,
          documentId: doc.id,
          action: "permission:revoke",
          outcome: "denied",
          details: { reason: "non_owner_revoke_attempt", callerAccess: doc.access_level },
        });
        res.status(403).json({ error: "Only the document owner can revoke permissions" });
        return;
      }

      const activeGrant = await pool.query(
        "SELECT id, permission FROM public.document_permissions WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL",
        [documentId, targetUserId]
      );

      if (activeGrant.rows.length === 0) {
        res.status(404).json({ error: "No active permission grant found for this user" });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const revokeResult = await client.query(
          "UPDATE public.document_permissions SET revoked_at = now() WHERE document_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id;",
          [documentId, targetUserId]
        );

        if (revokeResult.rows.length === 0) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "No active permission grant found for this user" });
          return;
        }

        await recordAuditLog({
          actorId: userId,
          documentId: doc.id,
          action: "permission:revoke",
          outcome: "success",
          details: { targetUserId },
          client,
        });

        await client.query("COMMIT");

        res.json({ message: "Permission revoked successfully" });
      } catch (err: unknown) {
        await client.query("ROLLBACK");
        console.error("Error revoking permission:", err);
        res.status(500).json({ error: "Failed to revoke permission" });
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      console.error("Error in revoke permission route:", err);
      res.status(500).json({ error: "Failed to process permission revocation" });
    }
  }
);
