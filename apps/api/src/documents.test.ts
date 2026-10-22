import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Mock the database pool BEFORE importing the server module
const mockQuery = vi.fn();
const mockEnd = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();

const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

const mockConnect = vi.fn().mockResolvedValue(mockClient);

vi.mock("./db/pool.js", () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
    end: mockEnd,
    on: vi.fn(),
  },
}));

// Suppress console during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let app: any;
let setSupabaseAdminForTesting: (client: any) => void;

const mockGetUser = vi.fn();
const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
  },
};

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const READER_ID = "22222222-2222-4222-8222-222222222222";
const EDITOR_ID = "33333333-3333-4333-8333-333333333333";
const STRANGER_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let currentUser = { id: OWNER_ID, email: "owner@example.com", role: "owner" };
let documentQueryQueue: Array<(sql: string, params?: any[]) => any> = [];

function authenticateAs(user: { id: string; email: string; role?: string }) {
  currentUser = { id: user.id, email: user.email, role: user.role || "owner" };
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: user.id,
        email: user.email,
      },
    },
    error: null,
  });
}

function queueDocQuery(resultOrFn: any) {
  if (typeof resultOrFn === "function") {
    documentQueryQueue.push(resultOrFn);
  } else {
    documentQueryQueue.push(() => Promise.resolve(resultOrFn));
  }
}

beforeAll(async () => {
  const supabaseMod = await import("./supabase.js");
  setSupabaseAdminForTesting = supabaseMod.setSupabaseAdminForTesting;
  setSupabaseAdminForTesting(mockSupabaseAdmin);

  const serverMod = await import("./server.js");
  app = serverMod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
  documentQueryQueue = [];
  authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
  mockConnect.mockResolvedValue(mockClient);
  mockClientQuery.mockResolvedValue({ rows: [] });

  mockQuery.mockImplementation((sql: string, params?: any[]) => {
    // 1. Handle auth user provisioning in requireAuth
    if (sql.includes("INSERT INTO public.users")) {
      return Promise.resolve({
        rows: [
          {
            id: currentUser.id,
            email: currentUser.email,
            role: currentUser.role,
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ],
      });
    }

    // 2. Handle document/permission queries queued by test
    if (documentQueryQueue.length > 0) {
      const nextFn = documentQueryQueue.shift()!;
      return nextFn(sql, params);
    }

    return Promise.resolve({ rows: [] });
  });
});

describe("Phase 5: Document and Permission Engine", () => {
  // Test 1: Unauthenticated requests
  it("rejects unauthenticated requests to document endpoints with 401", async () => {
    const res = await request(app).get("/api/documents");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization header is required");
  });

  // Test 2: Owner creates document metadata
  it("allows authenticated user to create document metadata and assigns ownership", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // Mock transactional inserts
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "Quarterly Strategy",
              category: "Confidential",
              mime_type: "application/pdf",
              size_bytes: 1048576,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .send({
        title: "Quarterly Strategy",
        category: "Confidential",
        mime_type: "application/pdf",
        size_bytes: 1048576,
      });

    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.id).toBe(DOC_ID);
    expect(res.body.document.owner_id).toBe(OWNER_ID);
    expect(res.body.document.title).toBe("Quarterly Strategy");
    expect(res.body.document.access_level).toBe("owner");
    // Ensure internal storage_key is never exposed in response
    expect(res.body.document.storage_key).toBeUndefined();

    // Verify transaction lifecycle and audit logging
    const clientSqlCalls = mockClientQuery.mock.calls.map((call) => call[0]);
    expect(clientSqlCalls).toContain("BEGIN");
    expect(clientSqlCalls.some((sql) => sql.includes("INSERT INTO public.audit_logs"))).toBe(true);
    expect(clientSqlCalls).toContain("COMMIT");
  });

  // Test 3: Cross-user isolation (stranger cannot access private document)
  it("returns 404 and logs denied audit when stranger accesses an unshared document", async () => {
    authenticateAs({ id: STRANGER_ID, email: "stranger@example.com" });

    // 1. getDocumentWithAccess -> no rows
    queueDocQuery({ rows: [] });
    // 2. recordAuditLog -> audit inserted
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-stranger-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");

    // Verify denied audit log was recorded
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.audit_logs"),
      expect.arrayContaining([STRANGER_ID, DOC_ID, "document:read", "denied"])
    );
  });

  // Test 4: Reader can read metadata but CANNOT edit
  it("allows active reader to view metadata but forbids PATCH update (403)", async () => {
    authenticateAs({ id: READER_ID, email: "reader@example.com" });

    // Reader calls GET /api/documents/:id
    // 1. getDocumentWithAccess -> doc with access_level: 'read'
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Quarterly Strategy",
          category: "Confidential",
          mime_type: "application/pdf",
          size_bytes: 1048576,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "read",
        },
      ],
    });
    // 2. recordAuditLog success
    queueDocQuery({ rows: [] });

    const getRes = await request(app)
      .get(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-reader-token");

    expect(getRes.status).toBe(200);
    expect(getRes.body.document.access_level).toBe("read");

    // Reader attempts PATCH /api/documents/:id
    // 1. getDocumentWithAccess -> doc with access_level: 'read'
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Quarterly Strategy",
          category: "Confidential",
          deleted_at: null,
          access_level: "read",
        },
      ],
    });
    // 2. recordAuditLog denied
    queueDocQuery({ rows: [] });

    const patchRes = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-reader-token")
      .send({ title: "Tampered by Reader" });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error).toMatch(/read-only users cannot edit/i);
    // Ensure no client transaction or mutation was attempted
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // Test 5: Editor can edit allowed metadata
  it("allows active editor to update document title and category", async () => {
    authenticateAs({ id: EDITOR_ID, email: "editor@example.com" });

    // 1. getDocumentWithAccess -> doc with access_level: 'edit'
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Quarterly Strategy",
          category: "Confidential",
          deleted_at: null,
          access_level: "edit",
        },
      ],
    });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "Updated Title by Editor",
              category: "Public Strategy",
              mime_type: "application/pdf",
              size_bytes: 1048576,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-editor-token")
      .send({ title: "Updated Title by Editor", category: "Public Strategy" });

    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe("Updated Title by Editor");
    expect(res.body.document.category).toBe("Public Strategy");
    expect(res.body.document.access_level).toBe("edit");
  });

  // Test 6: Editor CANNOT delete document or grant permissions
  it("forbids editor from deleting document (403)", async () => {
    authenticateAs({ id: EDITOR_ID, email: "editor@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          deleted_at: null,
          access_level: "edit",
        },
      ],
    });
    // Denied audit
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .delete(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-editor-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the document owner can delete/i);
  });

  it("forbids editor from granting permissions (403)", async () => {
    authenticateAs({ id: EDITOR_ID, email: "editor@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          deleted_at: null,
          access_level: "edit",
        },
      ],
    });
    // Denied audit
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-editor-token")
      .send({ user_id: STRANGER_ID, permission: "read" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the document owner can grant permissions/i);
  });

  // Test 7: Owner grants permission to active user
  it("allows owner to grant read permission to an active user", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. Doc check -> owner
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    // 2. Target user lookup -> exists & active
    queueDocQuery({
      rows: [{ id: READER_ID, email: "reader@example.com", is_active: true }],
    });

    // 3. Duplicate check -> none active
    queueDocQuery({ rows: [] });

    // 4. Transactional insert
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.document_permissions")) {
        return Promise.resolve({
          rows: [
            {
              id: "grant-uuid-1",
              document_id: DOC_ID,
              user_id: READER_ID,
              permission: "read",
              granted_by: OWNER_ID,
              granted_at: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "read" });

    expect(res.status).toBe(201);
    expect(res.body.permission.permission).toBe("read");
    expect(res.body.permission.user_id).toBe(READER_ID);
  });

  // Test 8: Duplicate active grant rejected with 409 Conflict
  it("rejects duplicate active permission grant with 409 Conflict without silent mutation", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. getDocumentWithAccess -> owner
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    // 2. target user check
    queueDocQuery({
      rows: [{ id: READER_ID, email: "reader@example.com", is_active: true }],
    });
    // 3. active grant check -> already exists
    queueDocQuery({
      rows: [{ id: "existing-grant-id", permission: "read" }],
    });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "edit" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already has an active permission grant/i);
    // Ensure no client transaction was opened
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // Test 9: Owner revokes permission and access is immediately revoked
  it("allows owner to revoke permission and subsequent requests by user are rejected (404)", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. getDocumentWithAccess -> owner
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    // 2. active grant lookup
    queueDocQuery({
      rows: [{ id: "active-grant-id", permission: "read" }],
    });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.document_permissions")) {
        return Promise.resolve({ rows: [{ id: "active-grant-id" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const revokeRes = await request(app)
      .delete(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.message).toMatch(/Permission revoked successfully/i);

    // Now test that revoked user receives 404
    authenticateAs({ id: READER_ID, email: "reader@example.com" });
    // 1. getDocumentWithAccess returns null because revoked_at IS NOT NULL
    queueDocQuery({ rows: [] });
    // 2. recordAuditLog denied
    queueDocQuery({ rows: [] });

    const subsequentGetRes = await request(app)
      .get(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-reader-token");

    expect(subsequentGetRes.status).toBe(404);
  });

  // Test 10: Rejection of immutable fields and client-specified owner_id
  it("rejects client attempts to provide owner_id, storage_key, or id during creation", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .send({
        title: "Malicious Document",
        category: "Test",
        owner_id: STRANGER_ID,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Field 'owner_id' cannot be specified/i);
  });

  it("rejects client attempts to update owner_id via PATCH", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ owner_id: STRANGER_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Field 'owner_id' is immutable/i);
  });

  // Test 11: Validation of UUIDs and permission types
  it("rejects invalid UUID formats with 400 Bad Request", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .get("/api/documents/not-a-valid-uuid")
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid document ID format/i);
  });

  it("rejects invalid permission types such as 'admin' with 400 Bad Request", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid permission: must be 'read' or 'edit'/i);
  });

  // Test 12: Inactive or unknown users cannot be granted permissions (anti-enumeration)
  it("rejects granting permissions to a deactivated user with generic 404", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. doc check -> owner
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    // 2. target user lookup -> inactive
    queueDocQuery({
      rows: [{ id: READER_ID, email: "inactive@example.com", is_active: false }],
    });
    // 3. denied audit log
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "read" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Target user not found or not eligible/i);
  });

  it("rejects granting permissions to an unknown target user with generic 404", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. doc check -> owner
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    // 2. target user lookup -> not found
    queueDocQuery({ rows: [] });
    // 3. denied audit log
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ email: "unknown@example.com", permission: "read" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Target user not found or not eligible/i);
  });

  // Test 13: Transaction rollback when audit log write fails during mutation
  it("rolls back document creation transaction if audit logging fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "Failing Audit Doc",
              category: "Test",
              mime_type: "text/plain",
              size_bytes: 100,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit log disk failure"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .send({ title: "Failing Audit Doc", category: "Test" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to create document metadata");

    // Verify ROLLBACK was called and COMMIT was never reached
    const clientSqlCalls = mockClientQuery.mock.calls.map((c) => c[0]);
    expect(clientSqlCalls).toContain("BEGIN");
    expect(clientSqlCalls).toContain("ROLLBACK");
    expect(clientSqlCalls).not.toContain("COMMIT");
    expect(mockClientRelease).toHaveBeenCalled();
  });

  // Test 14: Document listing cross-user isolation
  it("lists only documents owned by or shared with the caller, excluding unshared documents", async () => {
    authenticateAs({ id: READER_ID, email: "reader@example.com" });

    queueDocQuery((sql: string, params?: any[]) => {
      expect(params?.[0]).toBe(READER_ID);
      expect(sql).toContain("WHERE d.deleted_at IS NULL");
      expect(sql).toContain("(d.owner_id = $1 OR p.id IS NOT NULL)");
      return Promise.resolve({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Shared Strategy",
            category: "General",
            mime_type: "application/pdf",
            size_bytes: 1024,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            access_level: "read",
          },
        ],
      });
    });

    const res = await request(app)
      .get("/api/documents")
      .set("Authorization", "Bearer valid-reader-token");

    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe(DOC_ID);
    expect(res.body.documents[0].access_level).toBe("read");
  });

  // Test 15: Soft-deleted documents excluded across all endpoints
  it("excludes soft-deleted documents from GET, PATCH, DELETE, and permission endpoints (404)", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 1. GET /:id returns 404
    queueDocQuery({ rows: [] }); // getDocumentWithAccess returns null for deleted doc
    queueDocQuery({ rows: [] }); // denied audit log
    const getRes = await request(app)
      .get(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token");
    expect(getRes.status).toBe(404);
    expect(getRes.body.error).toBe("Document not found");

    // 2. PATCH /:id returns 404
    queueDocQuery({ rows: [] });
    queueDocQuery({ rows: [] });
    const patchRes = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ title: "New Title" });
    expect(patchRes.status).toBe(404);

    // 3. DELETE /:id returns 404
    queueDocQuery({ rows: [] });
    queueDocQuery({ rows: [] });
    const deleteRes = await request(app)
      .delete(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token");
    expect(deleteRes.status).toBe(404);

    // 4. GET /:id/permissions returns 404
    queueDocQuery({ rows: [] });
    queueDocQuery({ rows: [] });
    const getPermRes = await request(app)
      .get(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token");
    expect(getPermRes.status).toBe(404);

    // 5. POST /:id/permissions returns 404
    queueDocQuery({ rows: [] });
    queueDocQuery({ rows: [] });
    const postPermRes = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "read" });
    expect(postPermRes.status).toBe(404);
  });

  // Test 16: Owner vs non-owner access to permissions list
  it("allows owner to view permissions list but forbids non-owner (403)", async () => {
    // 1. Owner views permissions -> 200
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [
        {
          id: "perm-1",
          document_id: DOC_ID,
          user_id: READER_ID,
          user_email: "reader@example.com",
          permission: "read",
          granted_by: OWNER_ID,
          granted_at: new Date().toISOString(),
        },
      ],
    });

    const ownerRes = await request(app)
      .get(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token");
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.permissions).toHaveLength(1);
    expect(ownerRes.body.permissions[0].user_email).toBe("reader@example.com");

    // 2. Reader attempts to view permissions -> 403
    authenticateAs({ id: READER_ID, email: "reader@example.com" });
    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "read" }],
    });
    queueDocQuery({ rows: [] }); // denied audit

    const readerRes = await request(app)
      .get(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-reader-token");
    expect(readerRes.status).toBe(403);
    expect(readerRes.body.error).toMatch(/Only the document owner can view permissions/i);
  });

  // Test 17: Self-grant prevention
  it("rejects granting permissions to oneself or the document owner with 400 Bad Request", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [{ id: OWNER_ID, email: "owner@example.com", is_active: true }],
    });
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: OWNER_ID, permission: "read" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot grant permissions to yourself or the document owner/i);
  });

  // Test 18: Repeated/concurrent revocation handling
  it("returns 404 when attempting to revoke an already revoked or non-existent grant", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({ rows: [] }); // active grant query returns 0 rows

    const res = await request(app)
      .delete(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No active permission grant found/i);
  });

  it("handles concurrent revocation safely when 0 rows are updated in the transaction", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [{ id: "active-grant-id", permission: "read" }],
    });

    // Concurrent revocation won the race, returning 0 rows updated
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.document_permissions")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .delete(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No active permission grant found/i);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  // Test 19: Concurrent grant error handling (PostgreSQL 23505)
  it("handles concurrent grant race condition (PostgreSQL 23505) and returns 409 Conflict", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [{ id: READER_ID, email: "reader@example.com", is_active: true }],
    });
    queueDocQuery({ rows: [] }); // initial check passes

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.document_permissions")) {
        const error: any = new Error("duplicate key value violates unique constraint");
        error.code = "23505";
        return Promise.reject(error);
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "read" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/User already has an active permission grant/i);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  // Test 20: Audit write failures during update, delete, grant, and revoke
  it("rolls back document update transaction if audit logging fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.documents")) {
        return Promise.resolve({
          rows: [{ id: DOC_ID, owner_id: OWNER_ID, title: "Updated", category: "Test" }],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure during update"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ title: "Updated" });

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back document deletion transaction if audit logging fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.documents")) {
        return Promise.resolve({ rows: [{ id: DOC_ID }] });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure during delete"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .delete(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back permission grant transaction if audit logging fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [{ id: READER_ID, email: "reader@example.com", is_active: true }],
    });
    queueDocQuery({ rows: [] });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.document_permissions")) {
        return Promise.resolve({
          rows: [{ id: "perm-1", document_id: DOC_ID, user_id: READER_ID, permission: "read" }],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure during grant"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post(`/api/documents/${DOC_ID}/permissions`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ user_id: READER_ID, permission: "read" });

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back permission revoke transaction if audit logging fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "owner" }],
    });
    queueDocQuery({
      rows: [{ id: "active-grant-id", permission: "read" }],
    });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.document_permissions")) {
        return Promise.resolve({ rows: [{ id: "active-grant-id" }] });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure during revoke"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .delete(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  // Test 21: Admin role isolation
  it("enforces document isolation on admin users: unshared documents return 404", async () => {
    const ADMIN_ID = "55555555-5555-4555-8555-555555555555";
    authenticateAs({ id: ADMIN_ID, email: "admin@example.com", role: "admin" });

    queueDocQuery({ rows: [] }); // getDocumentWithAccess returns null
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-admin-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
  });

  // Test 22: TOCTOU in PATCH when permission is concurrently revoked
  it("rejects PATCH update with 403 when editor permission is concurrently revoked before atomic update", async () => {
    authenticateAs({ id: EDITOR_ID, email: "editor@example.com" });

    queueDocQuery({
      rows: [{ id: DOC_ID, owner_id: OWNER_ID, deleted_at: null, access_level: "edit" }],
    });

    // In transaction, atomic conditional update returns 0 rows because grant was revoked
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.documents")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}`)
      .set("Authorization", "Bearer valid-editor-token")
      .send({ title: "Concurrent Update" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Insufficient permissions or document is no longer active/i);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});
