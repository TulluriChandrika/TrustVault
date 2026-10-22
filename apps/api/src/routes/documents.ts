import { Router, Request, Response } from "express";
import crypto from "crypto";
import multer from "multer";
import { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { recordAuditLog } from "../audit.js";
import { getSupabaseAdmin } from "../supabase.js";
import {
  isValidUUID,
  sanitizeString,
  sanitizeFilename,
  buildContentDisposition,
  validateFileContent,
  MAX_FILE_SIZE_BYTES,
  MULTIPART_LIMITS,
} from "../utils/validation.js";

export const documentsRouter = Router();

// Enforce Phase 4 authentication on all document routes
documentsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: MULTIPART_LIMITS,
});

function handleUploadMiddleware(req: Request, res: Response, next: (err?: any) => void) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          switch (err.code) {
            case "LIMIT_FILE_SIZE":
              res.status(413).json({
                error: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
              });
              return;
            case "LIMIT_FIELD_VALUE":
              res.status(413).json({ error: "Field value exceeds maximum allowed size" });
              return;
            case "LIMIT_FILE_COUNT":
            case "LIMIT_UNEXPECTED_FILE":
              res.status(400).json({
                error: "Exactly one file upload is permitted under form field 'file'",
              });
              return;
            case "LIMIT_FIELD_COUNT":
              res.status(400).json({ error: "Too many form fields provided" });
              return;
            case "LIMIT_PART_COUNT":
              res.status(400).json({ error: "Too many multipart parts provided" });
              return;
            case "LIMIT_FIELD_KEY":
              res.status(400).json({ error: "Form field name is too long" });
              return;
            default:
              res.status(400).json({ error: `Multipart upload error: ${err.message}` });
              return;
          }
        }
        res.status(400).json({ error: "Malformed multipart form data" });
        return;
      }
      next();
    });
  } else {
    next();
  }
}

interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  category: string;
  storage_key: string;
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
      d.storage_key,
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
 * Create document with real private object storage upload (multipart/form-data)
 * or metadata-only (JSON body for backwards compatibility).
 */
documentsRouter.post(
  "/",
  handleUploadMiddleware,
  async (req: Request, res: Response): Promise<void> => {
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

    const category = sanitizeString(body.category);
    if (!category || category.length < 1 || category.length > 100) {
      res.status(400).json({ error: "Category is required and must be between 1 and 100 characters" });
      return;
    }

    const isMultipart = (req.headers["content-type"] || "").includes("multipart/form-data");
    if (isMultipart && !req.file) {
      res.status(400).json({ error: "File is required for multipart file uploads" });
      return;
    }

    // Branch A: Real file upload via multipart/form-data
    if (req.file) {
      const fileValidation = validateFileContent(req.file.buffer, req.file.mimetype);
      if (!fileValidation.isValid) {
        await recordAuditLog({
          actorId: userId,
          documentId: null,
          action: "file:upload",
          outcome: "denied",
          details: { reason: fileValidation.error, originalname: req.file.originalname },
        });
        res.status(400).json({ error: fileValidation.error });
        return;
      }

      let title = sanitizeString(body.title);
      if (!title) {
        title = sanitizeFilename(req.file.originalname);
      }
      if (!title || title.length < 1 || title.length > 200) {
        res.status(400).json({ error: "Title is required and must be between 1 and 200 characters" });
        return;
      }

      // Generate unpredictable server-side storage key
      const storageKey = `private/${userId}/${crypto.randomUUID()}.${fileValidation.extension}`;
      const bucketName = process.env.STORAGE_BUCKET_NAME || "trustvault-private";
      const supabase = getSupabaseAdmin();

      // Step 1: Upload to private storage
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .upload(storageKey, req.file.buffer, {
          contentType: fileValidation.detectedMimeType,
          upsert: false,
        });

      if (storageError) {
        console.error("Storage upload failed:", storageError);
        await recordAuditLog({
          actorId: userId,
          documentId: null,
          action: "file:upload",
          outcome: "failure",
          details: { reason: "storage_provider_error", message: storageError.message },
        });
        res.status(500).json({ error: "Failed to store file in object storage" });
        return;
      }

      // Step 2: Database transaction with compensating cleanup on any failure
      let uploadCommitted = false;
      let commitAttempted = false;
      let client: PoolClient | null = null;
      let clientReleased = false;
      let insertedDocId: string | null = null;

      const releaseClient = (destroy?: Error | boolean) => {
        if (client && !clientReleased) {
          clientReleased = true;
          try {
            client.release(destroy);
          } catch (relErr: unknown) {
            console.error("Error releasing database client:", relErr);
          }
        }
      };

      try {
        client = await pool.connect();
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
          fileValidation.detectedMimeType,
          req.file.size,
        ]);

        const createdDoc = result.rows[0];
        insertedDocId = createdDoc.id;

        await recordAuditLog({
          actorId: userId,
          documentId: createdDoc.id,
          action: "file:upload",
          outcome: "success",
          details: {
            title,
            category,
            mime_type: fileValidation.detectedMimeType,
            size_bytes: req.file.size,
          },
          client,
        });

        commitAttempted = true;
        await client.query("COMMIT");
        uploadCommitted = true;
        releaseClient(); // Healthy release back to pool upon successful commit

        res.status(201).json({
          document: {
            ...createdDoc,
            access_level: "owner",
          },
        });
      } catch (postUploadErr: unknown) {
        console.error(
          "Database insert or transaction failed after storage upload; initiating compensating reconciliation:",
          postUploadErr instanceof Error ? postUploadErr.message : "Unknown error"
        );

        // 1. Attempt rollback on the client connection if not committed
        let rollbackSucceeded = false;
        if (client && !uploadCommitted) {
          try {
            await client.query("ROLLBACK");
            rollbackSucceeded = true;
          } catch (rollbackErr: unknown) {
            rollbackSucceeded = false;
            console.error(
              "Transactional rollback failed after error:",
              rollbackErr instanceof Error ? rollbackErr.message : "Unknown error"
            );
          }
        }

        // Finding 1: Release or discard the original transaction client BEFORE running reconciliation queries
        // on the pool to avoid connection starvation or deadlocks in limited connection pools.
        // If rollback failed or an error occurred on the connection, pass error/true to discard it from the pool.
        const shouldDiscardClient = !rollbackSucceeded || !uploadCommitted;
        releaseClient(shouldDiscardClient ? (postUploadErr instanceof Error ? postUploadErr : true) : undefined);

        // 2. Determine transaction commit state across 3 distinct outcomes:
        // - "uncommitted": Conclusively confirmed that no active database record depends on this storage object.
        // - "committed": Conclusively confirmed that PostgreSQL committed the document record.
        // - "unknown": Verification query failed, or zero rows returned when outcome remains uncertain (COMMIT was attempted or ROLLBACK failed).
        type ReconciliationOutcome = "uncommitted" | "committed" | "unknown";
        let reconciliationOutcome: ReconciliationOutcome = "unknown";

        if (!insertedDocId) {
          // If INSERT never returned an ID (e.g. pool.connect failed or INSERT threw),
          // no database record was ever created or committed.
          reconciliationOutcome = "uncommitted";
        } else if (uploadCommitted) {
          reconciliationOutcome = "committed";
        } else {
          try {
            const checkRes = await pool.query(
              "SELECT id, deleted_at FROM public.documents WHERE id = $1",
              [insertedDocId]
            );

            if (checkRes.rows.length > 0) {
              reconciliationOutcome = "committed";
            } else {
              // Zero rows returned.
              // Finding 2: Zero rows do NOT prove uncommitted if COMMIT was attempted
              // or if ROLLBACK failed!
              // Only when COMMIT was never attempted AND ROLLBACK cleanly succeeded
              // does a zero-row result provide reliable evidence that the transaction aborted.
              if (!commitAttempted && rollbackSucceeded) {
                reconciliationOutcome = "uncommitted";
              } else {
                reconciliationOutcome = "unknown";
                console.error(
                  `[OPERATIONAL ALERT] Zero rows observed for document ${insertedDocId}, but transaction outcome remains unknown because ${
                    commitAttempted ? "COMMIT was attempted" : "ROLLBACK failed"
                  }. Preserving storage object ${storageKey} for manual recovery.`
                );
              }
            }
          } catch (checkErr: unknown) {
            reconciliationOutcome = "unknown";
            console.error(
              `[OPERATIONAL ALERT] Ambiguous COMMIT verification query failed for document ${insertedDocId}:`,
              checkErr instanceof Error ? checkErr.message : "Database connection or query error"
            );
          }
        }

        // 3. Compensating action based on conclusive outcome:
        if (reconciliationOutcome === "uncommitted") {
          // Conclusively uncommitted: safe to delete orphaned storage object
          try {
            await supabase.storage.from(bucketName).remove([storageKey]);
          } catch (cleanupErr: unknown) {
            console.error(
              "Compensating storage cleanup failed for orphaned object:",
              storageKey,
              cleanupErr instanceof Error ? cleanupErr.message : "Storage error"
            );
          }
        } else if (reconciliationOutcome === "committed") {
          // Conclusively committed: execute schema-safe compensating reconciliation via soft-delete
          // (preserves audit history and referential integrity while hiding from active queries)
          let dbSoftDeleteSucceeded = false;
          try {
            const softDeleteRes = await pool.query(
              "UPDATE public.documents SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
              [insertedDocId]
            );
            if (softDeleteRes.rows.length > 0) {
              dbSoftDeleteSucceeded = true;
            }
          } catch (softDeleteErr: unknown) {
            console.error(
              `[OPERATIONAL ALERT] Compensating soft-delete failed for committed document ${insertedDocId}:`,
              softDeleteErr instanceof Error ? softDeleteErr.message : "Database error"
            );
          }

          if (dbSoftDeleteSucceeded) {
            // Once document is conclusively soft-deleted, storage object can be safely cleaned up
            try {
              await supabase.storage.from(bucketName).remove([storageKey]);
            } catch (cleanupErr: unknown) {
              console.error(
                "Compensating storage cleanup failed after soft-deletion:",
                storageKey,
                cleanupErr instanceof Error ? cleanupErr.message : "Storage error"
              );
            }
          } else {
            // If compensating soft-delete failed, PRESERVE storage object so active database record has its file
            console.error(
              `[OPERATIONAL ALERT] Ambiguous commit detected for document ${insertedDocId} with storage key ${storageKey}. Preserving storage object because compensating soft-delete could not be confirmed.`
            );
          }
        } else {
          // Outcome is "unknown": reconciliation query failed, or zero rows after COMMIT/ROLLBACK failure.
          // NEVER delete storage when outcome cannot be conclusively established!
          console.error(
            `[OPERATIONAL ALERT] Ambiguous commit outcome remains unknown for document ${insertedDocId} with storage key ${storageKey}. Preserving storage object to prevent silent storage deletion while database state is unresolved.`
          );
        }

        // 4. Standalone failure audit logging
        try {
          await recordAuditLog({
            actorId: userId,
            documentId: null,
            action: "file:upload",
            outcome: "failure",
            details: { reason: "database_or_audit_persistence_failure" },
          });
        } catch (auditErr: unknown) {
          console.error("Failed to log upload failure audit entry:", auditErr);
        }

        res.status(500).json({ error: "Failed to create document metadata" });
      } finally {
        releaseClient(true);
      }
      return;
    }

    // Branch B: Metadata-only JSON (Phase 5 compatibility)
    const title = sanitizeString(body.title);
    if (!title || title.length < 1 || title.length > 200) {
      res.status(400).json({ error: "Title is required and must be between 1 and 200 characters" });
      return;
    }

    const mimeType = sanitizeString(body.mime_type) || "application/octet-stream";
    let sizeBytes = typeof body.size_bytes === "number" ? body.size_bytes : 1;
    if (sizeBytes <= 0) {
      sizeBytes = 1;
    }

    // Server-generated unique storage key indicating metadata-only record
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
  }
);

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
 * GET /api/documents/:id/download
 * Securely authorizes and streams file download from private object storage.
 * Accessible by owner, active editors, and active readers.
 */
documentsRouter.get("/:id/download", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const documentId = req.params.id;

  if (!isValidUUID(documentId)) {
    res.status(400).json({ error: "Invalid document ID format" });
    return;
  }

  try {
    const doc = await getDocumentWithAccess(documentId, userId);

    if (!doc || !doc.access_level) {
      // Record denied audit attempt without leaking document existence
      await recordAuditLog({
        actorId: userId,
        documentId,
        action: "file:download",
        outcome: "denied",
        details: { reason: "not_found_or_unauthorized" },
      });
      res.status(404).json({ error: "Document not found" });
      return;
    }

    // Distinguish metadata-only records from real files
    if (!doc.storage_key || doc.storage_key.startsWith("raw/") || !doc.storage_key.startsWith("private/")) {
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "file:download",
        outcome: "denied",
        details: { reason: "metadata_only_document" },
      });
      res.status(404).json({ error: "Document has no associated file content" });
      return;
    }

    const bucketName = process.env.STORAGE_BUCKET_NAME || "trustvault-private";
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage.from(bucketName).download(doc.storage_key);

    if (error || !data) {
      console.error("Storage download failed:", error);
      await recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "file:download",
        outcome: "failure",
        details: { reason: "storage_object_not_found_or_inaccessible" },
      });
      res.status(404).json({ error: "File content not found in storage" });
      return;
    }

    // Convert Blob or ArrayBuffer to Node.js Buffer
    let buffer: Buffer;
    if (typeof (data as any).arrayBuffer === "function") {
      const ab = await (data as any).arrayBuffer();
      buffer = Buffer.from(ab);
    } else if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      buffer = Buffer.from(data as any);
    }

    res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", buildContentDisposition(doc.title));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Content-Type-Options", "nosniff");

    let downloadAuditRecorded = false;

    const recordDownloadAudit = (outcome: "success" | "failure", reason?: string) => {
      if (downloadAuditRecorded) return;
      downloadAuditRecorded = true;

      recordAuditLog({
        actorId: userId,
        documentId: doc.id,
        action: "file:download",
        outcome,
        details: {
          size_bytes: buffer.length,
          ...(reason ? { reason } : {}),
        },
      }).catch((err: unknown) => {
        console.error(
          `[Audit] Failed to record download ${outcome} audit log:`,
          err instanceof Error ? err.message : "Unknown error"
        );
      });
    };

    res.on("finish", () => {
      recordDownloadAudit("success");
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        recordDownloadAudit("failure", "client_disconnected_or_transfer_interrupted");
      }
    });

    res.send(buffer);
  } catch (err: unknown) {
    console.error("Error processing document download:", err);
    res.status(500).json({ error: "Failed to download document" });
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
