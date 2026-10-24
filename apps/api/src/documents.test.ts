/**
 * Phase 5 & 6 Document Engine and Storage Lifecycle Test Suite
 *
 * TEST ISOLATION & SCOPE NOTICE:
 * All tests in this suite are isolated in-memory unit tests using Vitest and Supertest.
 * The PostgreSQL database connection pool (`pg.Pool`) and Supabase Storage client
 * (`SupabaseClient.storage`) are completely mocked via `vi.fn()` and `setSupabaseAdminForTesting`.
 * These tests verify Express route authorization, input/file validation, HTTP response contracts,
 * transaction rollback semantics, and compensating cleanup logic without connecting to live PostgreSQL
 * or live Supabase infrastructure. Live integration tests with real cloud services should be run
 * in a dedicated staging environment and are not part of this unit test suite.
 */

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
const mockStorageUpload = vi.fn();
const mockStorageDownload = vi.fn();
const mockStorageRemove = vi.fn();

const mockStorageBucket = {
  upload: mockStorageUpload,
  download: mockStorageDownload,
  remove: mockStorageRemove,
};

const mockStorageFrom = vi.fn().mockReturnValue(mockStorageBucket);

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
  },
  storage: {
    from: mockStorageFrom,
  },
};

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const READER_ID = "22222222-2222-4222-8222-222222222222";
const EDITOR_ID = "33333333-3333-4333-8333-333333333333";
const STRANGER_ID = "44444444-4444-4444-8444-444444444444";
const DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const VALID_PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF");
const VALID_TXT = Buffer.from("Valid UTF-8 plain text content for testing TrustVault storage.");

function createPdfArrayBuffer(pdf: Buffer = VALID_PDF): ArrayBuffer {
  const ab = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(ab).set(pdf);
  return ab;
}

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

  mockStorageFrom.mockReturnValue(mockStorageBucket);
  mockStorageUpload.mockResolvedValue({ data: { path: "private/test" }, error: null });
  mockStorageDownload.mockResolvedValue({
    data: {
      arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
    },
    error: null,
  });
  mockStorageRemove.mockResolvedValue({ data: [], error: null });

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

describe("Phase 6: Secure Document Lifecycle & Private Storage", () => {
  // Test 23: Unauthenticated file upload is rejected
  it("rejects unauthenticated upload requests with 401", async () => {
    const res = await request(app)
      .post("/api/documents")
      .field("category", "General")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization header is required");
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 24: Authorized multipart file upload succeeds
  it("allows authenticated owner to upload a valid PDF with server-generated key and audit logging", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "Quarterly_Report.pdf",
              category: "Financials",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
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
      .field("category", "Financials")
      .field("title", "Quarterly_Report.pdf")
      .attach("file", VALID_PDF, { filename: "Quarterly_Report.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.document.id).toBe(DOC_ID);
    expect(res.body.document.owner_id).toBe(OWNER_ID);
    expect(res.body.document.title).toBe("Quarterly_Report.pdf");
    expect(res.body.document.mime_type).toBe("application/pdf");
    expect(res.body.document.access_level).toBe("owner");
    expect(res.body.document.storage_key).toBeUndefined(); // Never leak internal key

    // Verify storage upload was performed with server-generated key in private namespace
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^private/${OWNER_ID}/[a-f0-9-]+\\.pdf$`)),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false })
    );

    // Verify transactional audit logging
    const clientCalls = mockClientQuery.mock.calls.map((c) => c[0]);
    expect(clientCalls).toContain("BEGIN");
    expect(clientCalls.some((sql) => sql.includes("INSERT INTO public.audit_logs"))).toBe(true);
    expect(clientCalls).toContain("COMMIT");
  });

  // Test 25: Empty file rejection
  it("rejects empty file (0 bytes) with 400 Bad Request and logs denied audit", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const emptyBuffer = Buffer.alloc(0);

    // Denied audit log queue
    queueDocQuery({ rows: [] });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", emptyBuffer, { filename: "empty.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Uploaded file is empty/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 26: Oversized file rejection
  it("rejects oversized file exceeding 10MB limit with 413", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Large")
      .attach("file", oversizedBuffer, { filename: "huge.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds the maximum allowed limit/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 27: Disallowed MIME type rejection
  it("rejects disallowed MIME type (.exe / application/x-msdownload) with 400", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const exeBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");

    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Software")
      .attach("file", exeBuffer, { filename: "malicious.exe", contentType: "application/x-msdownload" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported or disallowed MIME type/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 28: Spoofed MIME type rejection (magic bytes mismatch)
  it("rejects declared PDF whose content does not match PDF magic byte signature", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const fakePdfBuffer = Buffer.from("NOT_A_REAL_PDF_HEADER_JUST_RANDOM_TEXT");

    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", fakePdfBuffer, { filename: "fake.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match valid PDF signature/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 29: Plain text / CSV with null bytes rejected
  it("rejects text/plain file containing binary null bytes with 400", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const binaryTextBuffer = Buffer.from("Hello world\x00malicious binary null byte");

    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Data")
      .attach("file", binaryTextBuffer, { filename: "corrupt.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contains binary or invalid control characters/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 30: Valid UTF-8 text file upload succeeds
  it("allows owner to upload a valid UTF-8 text file", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "notes.txt",
              category: "Notes",
              mime_type: "text/plain",
              size_bytes: VALID_TXT.length,
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
      .field("category", "Notes")
      .attach("file", VALID_TXT, { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(201);
    expect(res.body.document.mime_type).toBe("text/plain");
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^private/${OWNER_ID}/[a-f0-9-]+\\.txt$`)),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "text/plain" })
    );
  });

  // Test 31: Client-supplied owner_id or storage_key in multipart body is rejected
  it("rejects client attempts to supply forbidden fields in multipart upload body", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .field("owner_id", STRANGER_ID)
      .attach("file", VALID_PDF, { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Field 'owner_id' cannot be specified/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 32: Storage upload failure handling
  it("returns 500 and aborts without DB transaction if storage upload fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockStorageUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "Supabase S3 bucket connection error" },
    });

    queueDocQuery({ rows: [] }); // failure audit log

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Docs")
      .attach("file", VALID_PDF, { filename: "report.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to store file in object storage/i);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // Test 33: Compensating cleanup when DB insertion fails after storage upload
  it("triggers compensating storage cleanup when database insert fails after upload", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.reject(new Error("Database connection lost"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    // Verify compensating cleanup removed the object from storage
    expect(mockStorageRemove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^private/${OWNER_ID}/[a-f0-9-]+\\.pdf$`)),
    ]);
  });

  // Test 34: Compensating cleanup when audit log write fails during upload transaction
  it("triggers compensating storage cleanup when audit log write fails during upload transaction", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "test.pdf",
              category: "Test",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit disk failure"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  // Test 35: Unauthenticated download rejection
  it("rejects unauthenticated download requests with 401", async () => {
    const res = await request(app).get(`/api/documents/${DOC_ID}/download`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization header is required");
  });

  // Test 36: Metadata-only record cannot be downloaded as a file
  it("rejects download of metadata-only records with 404 (anti-mistake protection)", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Metadata Only Doc",
          category: "Meta",
          storage_key: "raw/placeholder-uuid",
          mime_type: "application/pdf",
          size_bytes: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Document has no associated file content/i);
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  // Test 37: Owner can download their file with safe security headers
  it("allows owner to download authorized file with correct security headers and audit logging", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Quarterly Strategy.pdf",
          category: "Financials",
          storage_key: `private/${OWNER_ID}/strategy.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // success audit log

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="Quarterly Strategy.pdf"/i);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(mockStorageDownload).toHaveBeenCalledWith(`private/${OWNER_ID}/strategy.pdf`);
  });

  // Test 38: Active editor can download shared file
  it("allows active editor to download shared file", async () => {
    authenticateAs({ id: EDITOR_ID, email: "editor@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Shared For Editing.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/shared.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "edit",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // success audit

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-editor-token");

    expect(res.status).toBe(200);
  });

  // Test 39: Active reader can download shared file
  it("allows active reader to download shared file", async () => {
    authenticateAs({ id: READER_ID, email: "reader@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Read Only Doc.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/readonly.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "read",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // success audit

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-reader-token");

    expect(res.status).toBe(200);
  });

  // Test 40: Stranger cannot download unshared file (404 and denied audit)
  it("returns 404 and logs denied audit when stranger attempts to download an unshared document", async () => {
    authenticateAs({ id: STRANGER_ID, email: "stranger@example.com" });

    queueDocQuery({ rows: [] }); // getDocumentWithAccess returns null
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-stranger-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  // Test 41: Revoked user cannot download file (404 and denied audit)
  it("returns 404 and logs denied audit when revoked user attempts to download document", async () => {
    authenticateAs({ id: READER_ID, email: "reader@example.com" });

    // Access check returns null because revoked_at IS NOT NULL
    queueDocQuery({ rows: [] });
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-reader-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Document not found");
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  // Test 42: Soft-deleted document cannot be downloaded
  it("returns 404 and logs denied audit when attempting to download a soft-deleted document", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({ rows: [] }); // getDocumentWithAccess filters deleted_at IS NULL
    queueDocQuery({ rows: [] }); // denied audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  // Test 43: Missing storage object produces safe 404 error
  it("returns 404 and logs failure audit when object is unexpectedly missing in storage", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Missing Storage.pdf",
          category: "Lost",
          storage_key: `private/${OWNER_ID}/missing.pdf`,
          mime_type: "application/pdf",
          size_bytes: 1024,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: null,
      error: { message: "Object not found in bucket" },
    });

    queueDocQuery({ rows: [] }); // failure audit log

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/File content not found in storage/i);
  });

  // Test 44: Rejection of multipart upload without file field
  it("rejects multipart form request when file field is omitted (400 Bad Request)", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "General")
      .field("title", "Missing File");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/File is required for multipart file uploads/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 45: Filename sanitization strips semicolons, equals, and dots preventing header injection
  it("sanitizes filename containing semicolons, equals, and leading dots in Content-Disposition", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "..evil; filename=test.exe=foo.pdf..",
          category: "Work",
          storage_key: `private/${OWNER_ID}/safe.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // success audit

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain('filename="evil_ filename_test.exe_foo.pdf"');
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
  });

  // Test 46: Rejection of document with non-private storage key
  it("rejects download of document whose storage key is not in private namespace (404)", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Public Storage Doc",
          category: "General",
          storage_key: "public/unauthorized_leak.pdf",
          mime_type: "application/pdf",
          size_bytes: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });
    queueDocQuery({ rows: [] }); // denied audit

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Document has no associated file content/i);
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });

  // Test 47: Standalone failure audit logging when database insert fails after storage upload
  it("logs standalone failure audit when database insert fails after storage upload", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.reject(new Error("Database write failure"));
      }
      return Promise.resolve({ rows: [] });
    });

    let standaloneAuditLogged = false;
    queueDocQuery((sql: string, params?: any[]) => {
      if (sql.includes("INSERT INTO public.audit_logs") && params?.[3] === "failure") {
        standaloneAuditLogged = true;
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", VALID_PDF, { filename: "report.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(mockStorageRemove).toHaveBeenCalled();
    expect(standaloneAuditLogged).toBe(true);
  });

  // Test 48: Excessive form fields rejection (LIMIT_FIELD_COUNT -> 400)
  it("rejects multipart request exceeding form field count limit with 400", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    let reqBuilder = request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "General");

    for (let i = 0; i < 15; i++) {
      reqBuilder = reqBuilder.field(`extra_field_${i}`, `val_${i}`);
    }

    const res = await reqBuilder.attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Too many form fields provided/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 49: Oversized form field value rejection (LIMIT_FIELD_VALUE -> 413)
  it("rejects multipart request exceeding field value size limit with 413", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    const hugeFieldValue = "A".repeat(70 * 1024); // 70 KB > 64 KB limit

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "General")
      .field("title", hugeFieldValue)
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/Field value exceeds maximum allowed size/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 50: Multiple files attached rejection (LIMIT_UNEXPECTED_FILE / LIMIT_FILE_COUNT -> 400)
  it("rejects multipart request containing more than one file field with 400", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "General")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" })
      .attach("second_file", VALID_PDF, { filename: "test2.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Exactly one file upload is permitted/i);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  // Test 51: Compensating storage cleanup runs when pool.connect() fails after storage upload
  it("runs compensating storage cleanup when database connection acquisition fails after upload", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    mockConnect.mockRejectedValueOnce(new Error("Connection pool exhausted"));

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to create document metadata/i);
    expect(mockStorageRemove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^private/${OWNER_ID}/[a-f0-9-]+\\.pdf$`)),
    ]);
  });

  // Test 52: Compensating storage cleanup runs even when transactional ROLLBACK throws
  it("runs compensating storage cleanup even when client ROLLBACK throws an error", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.reject(new Error("Constraint violation"));
      }
      if (sql.includes("ROLLBACK")) {
        return Promise.reject(new Error("Connection terminated during rollback"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Test")
      .attach("file", VALID_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(mockStorageRemove).toHaveBeenCalled();
    expect(mockClientRelease).toHaveBeenCalled();
  });

  // Test 53: RFC 6266 / RFC 5987 Content-Disposition header with Unicode and special characters
  it("encodes Unicode, quotes, semicolons, and percent signs in RFC 6266 Content-Disposition header", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const complexTitle = `財務報告 "2026"; 100% (Draft) & *Final*.pdf`;
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: complexTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/report.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="____ _2026__ 100% (Draft) & *Final*.pdf"');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain("%E8%B2%A1%E5%8B%99%E5%A0%B1%E5%91%8A");
    expect(disposition).toContain("%222026%22%3B");
    expect(disposition).toContain("%28Draft%29");
    expect(disposition).toContain("%2AFinal%2A");
  });

  // Test 54: Content-Disposition strips CR and LF to prevent HTTP response splitting
  it("strips CR and LF from filename in Content-Disposition to prevent header injection", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const injectedTitle = "evil\r\nX-Injected-Header: injected\r\nfile.pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: injectedTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/injected.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toContain("evilX-Injected-Header: injectedfile.pdf");
  });

  // Test 55: Download audit failure during finish does not crash server or fail response
  it("handles download completion audit failures safely without crashing or failing the transfer", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Audit Test.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/audit_test.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    // Audit query throws an error
    queueDocQuery(() => Promise.reject(new Error("Audit database table locked")));

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
  });

  // Test 56: Exactly one download audit entry is recorded even when both finish and close events occur
  it("records exactly one audit entry when download response finishes and closes", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "Single Audit.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/single_audit.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    let auditWriteCount = 0;
    queueDocQuery((sql: string) => {
      if (sql.includes("INSERT INTO public.audit_logs")) {
        auditWriteCount++;
      }
      return Promise.resolve({ rows: [] });
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    // Allow microtask tick for async audit write
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(auditWriteCount).toBe(1);
  });

  // Test 57: Normalizes POSIX paths in download Content-Disposition
  it("strips POSIX directory paths before building both filename and filename* in Content-Disposition", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "/var/data/confidential/Quarterly_Report.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/report.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="Quarterly_Report.pdf"');
    expect(disposition).toContain("filename*=UTF-8''Quarterly_Report.pdf");
    expect(disposition).not.toContain("var");
    expect(disposition).not.toContain("confidential");
  });

  // Test 58: Normalizes directory traversal sequences (../../ and ..\\) in Content-Disposition
  it("strips path traversal sequences (../ and ..\\) before building both filenames in Content-Disposition", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "../../../../etc/passwd",
          category: "Work",
          storage_key: `private/${OWNER_ID}/passwd.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="passwd"');
    expect(disposition).toContain("filename*=UTF-8''passwd");
    expect(disposition).not.toContain("..");
    expect(disposition).not.toContain("etc");
  });

  // Test 59: Normalizes Windows drive letters, mixed separators, and Unicode filenames in Content-Disposition
  it("normalizes Windows drive letters, mixed separators, and Unicode filenames in Content-Disposition", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "C:\\Users\\Admin\\data/nested\\財務_2026.pdf",
          category: "Work",
          storage_key: `private/${OWNER_ID}/zaimu.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="___2026.pdf"');
    expect(disposition).toContain("filename*=UTF-8''%E8%B2%A1%E5%8B%99_2026.pdf");
    expect(disposition).not.toContain("Users");
    expect(disposition).not.toContain("Admin");
  });

  // Test 60: Removes edge dots and whitespace in one step
  it("removes edge dots and whitespace together in one step for both filenames", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: " . .report. . ",
          category: "Work",
          storage_key: `private/${OWNER_ID}/report.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="report"');
    expect(disposition).toContain("filename*=UTF-8''report");
  });

  // Test 61: Falls back to 'download' when title contains only dots and whitespace
  it("falls back to 'download' when normalization produces an empty filename from dots and whitespace", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: "   . . .   ",
          category: "Work",
          storage_key: `private/${OWNER_ID}/blank.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition).toContain('filename="download"');
    expect(disposition).toContain("filename*=UTF-8''download");
  });

  // Test 62: Truncates without splitting surrogate pairs (emoji at truncation boundary)
  it("truncates long filenames cleanly without splitting Unicode surrogate pairs", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 149 ASCII characters + 1 emoji (surrogate pair) + trailing text exceeding 150 limit
    const emojiTitle = "A".repeat(149) + "🎉" + "EXTRA_OVERFLOW_TEXT.pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: emojiTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/emoji.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // ASCII fallback has 149 'A's + '_' (from non-ASCII emoji)
    expect(disposition).toContain(`filename="${"A".repeat(149)}_"`);
    // UTF-8 filename* has 149 'A's + valid percent-encoded emoji %F0%9F%8E%89 (no malformed surrogate)
    expect(disposition).toContain("filename*=UTF-8''" + "A".repeat(149) + "%F0%9F%8E%89");
    expect(disposition).not.toContain("EXTRA_OVERFLOW");
  });

  // Test 63: Preserves combining characters without splitting grapheme clusters
  it("preserves combining characters as intact grapheme clusters during truncation", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 149 'B's + combining grapheme (e + acute accent \u0301) + trailing text
    const combiningTitle = "B".repeat(149) + "e\u0301" + "EXTRA.pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: combiningTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/combining.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // Encoded filename* contains complete e%CC%81 (combining mark intact)
    expect(disposition).toContain("filename*=UTF-8''" + "B".repeat(149) + "e%CC%81");
    expect(disposition).not.toContain("EXTRA");
  });

  // Test 64: Truncation re-applies edge cleaning if cut point ends on a dot
  it("cleans trailing dots if truncation cuts immediately after a period", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 149 characters + dot at position 150 + extra text
    const dotBoundaryTitle = "C".repeat(149) + ".MORE_STUFF.pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: dotBoundaryTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/dot.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // Trailing dot was stripped, so exactly 149 'C's
    expect(disposition).toContain(`filename="${"C".repeat(149)}"`);
    expect(disposition).toContain("filename*=UTF-8''" + "C".repeat(149));
  });

  // Test 65: Ambiguous COMMIT handling: preserves storage file if DB record remains committed and compensating soft-delete fails
  it("preserves storage file during ambiguous COMMIT if database record exists and soft-delete fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "important.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("COMMIT")) {
        return Promise.reject(new Error("Connection reset by peer during COMMIT"));
      }
      if (sql.includes("ROLLBACK")) {
        return Promise.reject(new Error("Cannot rollback committed transaction"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        return Promise.resolve({ rows: [{ id: DOC_ID, deleted_at: null }] });
      }
      if (sql.includes("UPDATE public.documents SET deleted_at = now()")) {
        return Promise.reject(new Error("Database disconnected during compensating soft-delete"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "important.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to create document metadata/i);
    // Crucial check: Storage cleanup MUST NOT be called because DB record exists and soft-delete failed
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  // Test 66: Ambiguous COMMIT handling: cleans up storage file if committed DB record is successfully soft-deleted
  it("cleans up storage file during ambiguous COMMIT when committed DB record is successfully soft-deleted", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "cleanup.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("COMMIT")) {
        return Promise.reject(new Error("Connection reset by peer during COMMIT"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        return Promise.resolve({ rows: [{ id: DOC_ID, deleted_at: null }] });
      }
      if (sql.includes("UPDATE public.documents SET deleted_at = now()")) {
        return Promise.resolve({ rows: [{ id: DOC_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "cleanup.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    // Document was successfully soft-deleted, so storage cleanup CAN safely proceed
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  // Test 67: Caps Content-Disposition total encoded length under 2KB for titles with heavy multi-byte graphemes
  it("caps Content-Disposition total encoded length safely within reverse-proxy buffer limits", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // 150 emojis where each percent-encodes to 12 chars (150 * 12 = 1800 chars encoded)
    const heavyEmojiTitle = "🎉".repeat(150) + ".pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: heavyEmojiTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/heavy.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // Header length must not exceed 2000 chars (safe for standard 4KB/8KB reverse proxies)
    expect(disposition.length).toBeLessThan(2000);
    expect(disposition).toContain("attachment; filename=");
    expect(disposition).toContain("filename*=UTF-8''");
  });

  // Test 68: Ambiguous COMMIT handling: preserves storage file when the commit verification query itself fails
  it("preserves storage file when the commit verification query itself fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "unknown.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("COMMIT")) {
        return Promise.reject(new Error("Connection dropped during COMMIT"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        // Reconciliation check itself fails (e.g. database timeout or network partition)
        return Promise.reject(new Error("Connection timeout on verification query"));
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "unknown.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to create document metadata/i);
    // Crucial Finding 2 check: MUST NOT delete storage when verification query fails
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  // Test 69: Finding 2: Zero rows do NOT prove uncommitted when COMMIT failed (outcome remains unknown, storage preserved)
  it("preserves storage file when COMMIT failed even if verification query returns zero rows", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "ambiguous.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("COMMIT")) {
        // COMMIT failed ambiguously
        return Promise.reject(new Error("Network disconnect during COMMIT"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        // Zero rows returned, but COMMIT was attempted so outcome is uncertain
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "ambiguous.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to create document metadata/i);
    // Crucial Finding 2 check: Zero rows after failed COMMIT must NOT trigger storage deletion
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  // Test 70: Finding 2: Zero rows do NOT prove uncommitted when ROLLBACK failed
  it("preserves storage file when ROLLBACK failed even if verification query returns zero rows", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "failed_rollback.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure before commit"));
      }
      if (sql.includes("ROLLBACK")) {
        // ROLLBACK itself throws an error (broken socket / deadlock)
        return Promise.reject(new Error("Broken socket during ROLLBACK"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "failed_rollback.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    // Finding 2 check: Because ROLLBACK failed, outcome is uncertain -> storage object MUST be preserved
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  // Test 71: Finding 2: Cleans up storage file when supported by reliable evidence (error before COMMIT + clean ROLLBACK + zero rows)
  it("cleans up storage file when clean ROLLBACK succeeds before COMMIT and zero rows are confirmed", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "clean_abort.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        // Error occurs inside transaction BEFORE COMMIT is ever attempted
        return Promise.reject(new Error("Audit failure before commit"));
      }
      if (sql.includes("ROLLBACK")) {
        // Clean rollback succeeds
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        // Conclusively confirmed uncommitted: 0 rows returned
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "clean_abort.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    // Reliable evidence of uncommitted state exists: storage cleanup proceeds
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  // Test 72: Finding 1: Releases transaction client BEFORE reconciliation queries are executed on the pool
  it("releases the transaction client BEFORE running reconciliation queries on the pool", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    let clientWasReleasedBeforePoolQuery = false;

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "order_check.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("COMMIT")) {
        return Promise.reject(new Error("Commit error"));
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        // Verify that mockClientRelease was called BEFORE this pool.query execution
        if (mockClientRelease.mock.calls.length > 0) {
          clientWasReleasedBeforePoolQuery = true;
        }
        return Promise.resolve({ rows: [{ id: DOC_ID, deleted_at: null }] });
      }
      if (sql.includes("UPDATE public.documents SET deleted_at = now()")) {
        return Promise.resolve({ rows: [{ id: DOC_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "order_check.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    // Finding 1 assertion: client must be released/discarded BEFORE reconciliation queries run
    expect(clientWasReleasedBeforePoolQuery).toBe(true);
    // Exactly once release
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  // Test 73: Finding 1: Discards transaction client from pool when transaction or rollback fails
  it("discards the transaction client from the pool with error when rollback fails", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    const rollbackError = new Error("Connection reset during rollback");

    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.documents")) {
        return Promise.resolve({
          rows: [
            {
              id: DOC_ID,
              owner_id: OWNER_ID,
              title: "discard_test.pdf",
              category: "Legal",
              mime_type: "application/pdf",
              size_bytes: VALID_PDF.length,
            },
          ],
        });
      }
      if (sql.includes("INSERT INTO public.audit_logs")) {
        return Promise.reject(new Error("Audit failure"));
      }
      if (sql.includes("ROLLBACK")) {
        return Promise.reject(rollbackError);
      }
      return Promise.resolve({ rows: [] });
    });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO public.users")) {
        return Promise.resolve({
          rows: [{ id: OWNER_ID, email: "owner@example.com", role: "owner", is_active: true }],
        });
      }
      if (sql.includes("SELECT id, deleted_at FROM public.documents WHERE id = $1")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Authorization", "Bearer valid-owner-token")
      .field("category", "Legal")
      .attach("file", VALID_PDF, { filename: "discard_test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    // Finding 1 assertion: client.release must be called with truthy/error argument to discard broken socket
    expect(mockClientRelease).toHaveBeenCalledWith(expect.anything());
    expect(mockClientRelease.mock.calls[0][0]).toBeTruthy();
  });

  // Test 74: Content-Disposition safely falls back when a single grapheme cluster exceeds the entire budget
  it("falls back to 'download' when a single grapheme cluster exceeds the length budget", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // Single grapheme cluster consisting of base character 'A' + 300 combining grave accents (\u0300).
    // Each \u0300 is 2 bytes UTF-8, percent-encoding to %CC%80 (6 chars). 300 * 6 = 1800 chars for ONE grapheme.
    const massiveGraphemeTitle = "A" + "\u0300".repeat(300) + ".pdf";
    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: massiveGraphemeTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/massive.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // Should fall back safely to 'download' rather than exceeding limit or bisecting the grapheme
    expect(disposition).toContain('filename="download"');
    expect(disposition).toContain("filename*=UTF-8''download");
    expect(disposition.length).toBeLessThan(2000);
  });

  // Test 75: Preserves complex joined emoji sequences (ZWJ) without splitting surrogate pairs or exceeding limit
  it("preserves complex joined emoji sequences (ZWJ) without splitting surrogate pairs or exceeding limit", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    // Family emoji (ZWJ sequence): 👨‍👩‍👧‍👦
    const zwjFamily = "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66";
    // 50 copies of family emoji (approx 1,250 UTF-8 bytes)
    const complexTitle = zwjFamily.repeat(50) + ".pdf";

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          title: complexTitle,
          category: "Work",
          storage_key: `private/${OWNER_ID}/complex.pdf`,
          mime_type: "application/pdf",
          size_bytes: VALID_PDF.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          access_level: "owner",
        },
      ],
    });

    mockStorageDownload.mockResolvedValueOnce({
      data: {
        arrayBuffer: () => Promise.resolve(createPdfArrayBuffer(VALID_PDF)),
      },
      error: null,
    });

    const res = await request(app)
      .get(`/api/documents/${DOC_ID}/download`)
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    expect(disposition.length).toBeLessThan(2000);
    expect(disposition).toContain("attachment; filename=");
    expect(disposition).toContain("filename*=UTF-8''");
    // Ensure no replacement characters from split surrogates
    expect(disposition).not.toContain("\uFFFD");
  });

  // Test 76: Owner can update an existing permission from read to edit
  it("allows owner to update active permission grant from read to edit", async () => {
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

    // 2. Active grant check -> exists as 'read'
    queueDocQuery({
      rows: [{ id: "grant-1", permission: "read" }],
    });

    // 3. Target user email lookup
    queueDocQuery({
      rows: [{ id: READER_ID, email: "reader@example.com" }],
    });

    // 4. Transactional update
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE public.document_permissions")) {
        return Promise.resolve({
          rows: [
            {
              id: "grant-1",
              document_id: DOC_ID,
              user_id: READER_ID,
              permission: "edit",
              granted_by: OWNER_ID,
              granted_at: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer valid-owner-token")
      .send({ permission: "edit" });

    expect(res.status).toBe(200);
    expect(res.body.permission.permission).toBe("edit");
    expect(res.body.permission.user_email).toBe("reader@example.com");
  });

  // Test 77: Non-owner cannot update permissions
  it("rejects non-owner attempts to update permission grants with 403", async () => {
    authenticateAs({ id: STRANGER_ID, email: "stranger@example.com" });

    queueDocQuery({
      rows: [
        {
          id: DOC_ID,
          owner_id: OWNER_ID,
          deleted_at: null,
          access_level: "read",
        },
      ],
    });

    const res = await request(app)
      .patch(`/api/documents/${DOC_ID}/permissions/${READER_ID}`)
      .set("Authorization", "Bearer stranger-token")
      .send({ permission: "edit" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the document owner can update permissions/i);
  });

  // Test 78: User can retrieve their activity log
  it("allows user to retrieve their authorized activity logs", async () => {
    authenticateAs({ id: OWNER_ID, email: "owner@example.com" });

    queueDocQuery({
      rows: [
        {
          id: 1,
          actor_id: OWNER_ID,
          actor_email: "owner@example.com",
          document_id: DOC_ID,
          document_title: "Confidential.pdf",
          action: "file:download",
          outcome: "success",
          details: {},
          created_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .get("/api/documents/activity")
      .set("Authorization", "Bearer valid-owner-token");

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].action).toBe("file:download");
  });
});

