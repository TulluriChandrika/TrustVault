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

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let app: any;
let setSupabaseAdminForTesting: (client: any) => void;

const mockGetUser = vi.fn();
const mockUpdateUserById = vi.fn();
const mockStorageDownload = vi.fn();

const mockStorageBucket = {
  upload: vi.fn(),
  download: mockStorageDownload,
  remove: vi.fn(),
};

const mockStorageFrom = vi.fn().mockReturnValue(mockStorageBucket);

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
    admin: {
      updateUserById: mockUpdateUserById,
    },
  },
  storage: {
    from: mockStorageFrom,
  },
};

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const JOHN_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const DOC_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeAll(async () => {
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
  process.env.STORAGE_BUCKET_NAME = "trustvault-private";

  const supabaseModule = await import("./supabase.js");
  setSupabaseAdminForTesting = supabaseModule.setSupabaseAdminForTesting;
  setSupabaseAdminForTesting(mockSupabaseAdmin);

  const serverModule = await import("./server.js");
  app = serverModule.default;
});

beforeEach(() => {
  vi.clearAllMocks();
  if (setSupabaseAdminForTesting) {
    setSupabaseAdminForTesting(mockSupabaseAdmin);
  }
  mockConnect.mockResolvedValue(mockClient);
  mockGetUser.mockReset();
  mockUpdateUserById.mockReset();
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockStorageDownload.mockReset();
  mockStorageFrom.mockReturnValue(mockStorageBucket);
});

describe("TrustVault Feature Enhancements & Security Verification", () => {
  // =========================================================================
  // 1. GLOBAL SEARCH TESTS
  // =========================================================================
  describe("Global Document Search API", () => {
    it("supports search query parameter 'q' matching title, category, description, or owner", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            owner_email: "alice@example.com",
            title: "Financial_Report_Q4.pdf",
            category: "Financial",
            description: "Audited financial statements",
            access_level: "owner",
          },
        ],
      });

      const res = await request(app)
        .get("/api/documents?q=Report")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].title).toBe("Financial_Report_Q4.pdf");

      // Verify ILIKE query parameters
      const sqlCall = mockQuery.mock.calls[1];
      expect(sqlCall[0]).toContain("ILIKE");
      expect(sqlCall[1]).toContain("%Report%");
    });

    it("supports case-insensitive search and view filtering", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const res = await request(app)
        .get("/api/documents?q=contract&view=shared")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      const sqlCall = mockQuery.mock.calls[1];
      expect(sqlCall[0]).toContain("d.owner_id != $1 AND p.id IS NOT NULL");
      expect(sqlCall[1]).toContain("%contract%");
    });

    it("returns empty results for non-matching queries without errors", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true }],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const res = await request(app)
        .get("/api/documents?q=nonexistent_file_xyz")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.documents).toEqual([]);
    });
  });

  // =========================================================================
  // 2. MEANINGFUL EDIT ACCESS & PERMISSION TESTS (Alice, Bob, John)
  // =========================================================================
  describe("Meaningful Edit Access Control", () => {
    it("Bob with Read access can download but cannot rename or edit metadata", async () => {
      // 1. Bob attempts download -> 200
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: BOB_ID, email: "bob@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: BOB_ID, email: "bob@example.com", role: "user", is_active: true }],
      });
      // getDocumentWithAccess: Bob has read permission on Alice's doc
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            title: "AliceDoc.pdf",
            storage_key: `private/${ALICE_ID}/test.pdf`,
            mime_type: "application/pdf",
            access_level: "read",
          },
        ],
      });
      mockStorageDownload.mockResolvedValueOnce({
        data: Buffer.from("dummy-pdf-content"),
        error: null,
      });

      const downloadRes = await request(app)
        .get(`/api/documents/${DOC_ID}/download`)
        .set("Authorization", "Bearer bob-token");

      expect(downloadRes.status).toBe(200);

      // 2. Bob attempts rename -> 403 Forbidden
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: BOB_ID, email: "bob@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: BOB_ID, email: "bob@example.com", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            title: "AliceDoc.pdf",
            category: "General",
            access_level: "read",
          },
        ],
      });

      const renameRes = await request(app)
        .patch(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer bob-token")
        .send({ title: "BobRenamed.pdf" });

      expect(renameRes.status).toBe(403);
      expect(renameRes.body.error).toMatch(/read-only users cannot edit/i);
    });

    it("Bob with Edit access can rename and update details", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: BOB_ID, email: "bob@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: BOB_ID, email: "bob@example.com", role: "user", is_active: true }],
      });
      // getDocumentWithAccess: Bob has edit permission
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            title: "AliceDoc.pdf",
            category: "General",
            description: "Old description",
            access_level: "edit",
          },
        ],
      });

      // Update query returning updated doc
      mockClientQuery.mockResolvedValueOnce({}); // BEGIN
      mockClientQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            title: "RenamedDoc.pdf",
            category: "Contracts",
            description: "Updated by Bob",
            access_level: "edit",
          },
        ],
      });
      mockClientQuery.mockResolvedValueOnce({}); // audit log insert
      mockClientQuery.mockResolvedValueOnce({}); // audit log insert
      mockClientQuery.mockResolvedValueOnce({}); // COMMIT

      const updateRes = await request(app)
        .patch(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer bob-token")
        .send({
          title: "RenamedDoc.pdf",
          category: "Contracts",
          description: "Updated by Bob",
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.document.title).toBe("RenamedDoc.pdf");
      expect(updateRes.body.document.category).toBe("Contracts");
    });

    it("Bob with Edit access CANNOT delete the document (Owner only)", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: BOB_ID, email: "bob@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: BOB_ID, email: "bob@example.com", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: ALICE_ID,
            access_level: "edit",
          },
        ],
      });

      const deleteRes = await request(app)
        .delete(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer bob-token");

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error).toMatch(/Only the document owner can delete/i);
    });

    it("John with no access gets 404 without revealing document existence", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: JOHN_ID, email: "john@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: JOHN_ID, email: "john@example.com", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [], // John has no access
      });

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer john-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");
    });
  });

  // =========================================================================
  // 3. AUDIT ACCESS CONTROL TESTS
  // =========================================================================
  describe("Audit Access Control Enforcement", () => {
    it("regular user Activity endpoint strictly queries documents owned by authenticated user", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            actor_id: BOB_ID,
            document_id: DOC_ID,
            document_title: "AliceDoc.pdf",
            action: "file:download",
            outcome: "success",
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get("/api/documents/activity")
        .set("Authorization", "Bearer alice-token");

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);

      // Verify SQL contains owner restriction
      const sqlCall = mockQuery.mock.calls[1];
      expect(sqlCall[0]).toMatch(/WHERE\s+a\.document_id\s+IN\s*\(\s*SELECT\s+id\s+FROM\s+public\.documents\s+WHERE\s+owner_id\s*=\s*\$1\s*\)/i);
    });

    it("regular user cannot supply another user's document_id to inspect its audit activity", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: BOB_ID, email: "bob@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: BOB_ID, email: "bob@example.com", role: "user", is_active: true }],
      });
      // Ownership check returns 0 rows (Bob does not own DOC_ID)
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const res = await request(app)
        .get(`/api/documents/activity?document_id=${DOC_ID}`)
        .set("Authorization", "Bearer bob-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");
    });

    it("non-admin users are strictly blocked from global administrative audit logs", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true }],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer alice-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only administrators can access audit logs/i);
    });

    it("authorized admin can access global administrative audit logs", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ADMIN_ID, email: "admin@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ADMIN_ID, email: "admin@example.com", role: "admin", is_active: true }],
      });
      // Total count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: "10" }],
      });
      // Records query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            action: "file:upload",
            outcome: "success",
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.total).toBe(10);
    });
  });

  // =========================================================================
  // 4. PROFILE UPDATE & SETTINGS TESTS
  // =========================================================================
  describe("User Profile Update API (PATCH /api/me)", () => {
    it("allows authenticated user to update full_name and persists changes", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: ALICE_ID,
            email: "alice@example.com",
            full_name: "Alice Cooper",
            role: "user",
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ],
      });
      mockUpdateUserById.mockResolvedValueOnce({ data: {}, error: null });

      const res = await request(app)
        .patch("/api/me")
        .set("Authorization", "Bearer alice-token")
        .send({ full_name: "Alice Cooper" });

      expect(res.status).toBe(200);
      expect(res.body.user.full_name).toBe("Alice Cooper");
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        ALICE_ID,
        expect.objectContaining({
          user_metadata: expect.objectContaining({ full_name: "Alice Cooper" }),
        })
      );
    });

    it("rejects client attempts to escalate role or modify immutable fields", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: ALICE_ID, email: "alice@example.com" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: ALICE_ID, email: "alice@example.com", role: "user", is_active: true }],
      });

      const res = await request(app)
        .patch("/api/me")
        .set("Authorization", "Bearer alice-token")
        .send({ role: "admin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot be modified/i);
    });
  });
});
