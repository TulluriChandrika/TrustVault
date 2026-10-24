import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Mock the database pool BEFORE importing the server module
const mockQuery = vi.fn();
const mockEnd = vi.fn();

vi.mock("./db/pool.js", () => ({
  pool: {
    query: mockQuery,
    end: mockEnd,
    on: vi.fn(),
  },
}));

// Suppress console logging during tests
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

beforeAll(async () => {
  const supabaseMod = await import("./supabase.js");
  setSupabaseAdminForTesting = supabaseMod.setSupabaseAdminForTesting;
  setSupabaseAdminForTesting(mockSupabaseAdmin);

  const serverMod = await import("./server.js");
  app = serverMod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "44444444-4444-4444-8444-444444444444";

function mockAuthAs(user: { id: string; email: string; role: "admin" | "owner" | "viewer"; is_active?: boolean }) {
  mockGetUser.mockResolvedValueOnce({
    data: {
      user: {
        id: user.id,
        email: user.email,
      },
    },
    error: null,
  });

  // First DB query inside requireAuth is the user sync/fetch
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: user.is_active !== undefined ? user.is_active : true,
        created_at: "2026-10-20T12:00:00Z",
      },
    ],
  });
}

describe("Phase 7: Administrative Audit APIs & Access Control", () => {
  describe("1. Authorization & Role Enforcement", () => {
    it("rejects unauthenticated requests to list audit logs (401)", async () => {
      const res = await request(app).get("/api/admin/audit-logs");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authorization header is required");
    });

    it("rejects unauthenticated requests to get audit log by ID (401)", async () => {
      const res = await request(app).get("/api/admin/audit-logs/1");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Authorization header is required");
    });

    it("rejects regular user with 'owner' role and records denied audit log (403)", async () => {
      mockAuthAs({ id: OWNER_ID, email: "owner@example.com", role: "owner" });
      // Standalone audit log query mock for denied access
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer valid-owner-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Only administrators can access audit logs");

      // Verify that denied audit log was recorded
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[0]).toContain("INSERT INTO public.audit_logs");
      expect(auditCall[1][0]).toBe(OWNER_ID); // actor_id
      expect(auditCall[1][1]).toBeNull(); // document_id
      expect(auditCall[1][2]).toBe("audit_log:read"); // action
      expect(auditCall[1][3]).toBe("denied"); // outcome
      const details = JSON.parse(auditCall[1][4]);
      expect(details.reason).toBe("forbidden_non_admin_role");
      expect(details.actual_role).toBe("owner");
    });

    it("rejects regular user with 'viewer' role and records denied audit log (403)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "viewer@example.com", role: "viewer" });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/admin/audit-logs/42")
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Only administrators can access audit logs");

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const auditCall = mockQuery.mock.calls[1];
      expect(auditCall[0]).toContain("INSERT INTO public.audit_logs");
      expect(auditCall[1][0]).toBe(VIEWER_ID);
      expect(auditCall[1][2]).toBe("audit_log:read");
      expect(auditCall[1][3]).toBe("denied");
      const details = JSON.parse(auditCall[1][4]);
      expect(details.actual_role).toBe("viewer");
    });

    it("ignores client-supplied role in query, body, or headers to escalate privileges", async () => {
      // The DB returns role: 'owner' regardless of client claim
      mockAuthAs({ id: OWNER_ID, email: "attacker@example.com", role: "owner" });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/admin/audit-logs?role=admin")
        .set("Authorization", "Bearer valid-token")
        .set("X-Role", "admin")
        .send({ role: "admin" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Only administrators can access audit logs");
    });

    it("rejects deactivated user account before reaching administrative checks (403)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "deactivated-admin@trustvault.local", role: "admin", is_active: false });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Account is deactivated");
      // requireAuth rejected request; no audit query or admin denial log issued
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("allows user with 'admin' role to access audit log list (200)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      // Mock COUNT(*) query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "1" }] });
      // Mock SELECT audit_logs query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "101",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "file:upload",
            outcome: "success",
            details: { title: "q3_report.pdf", mime_type: "application/pdf" },
            created_at: "2026-10-22T10:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("audit_logs");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body.audit_logs).toHaveLength(1);
      expect(res.body.audit_logs[0].id).toBe("101");
      expect(res.body.audit_logs[0].action).toBe("file:upload");
      expect(res.body.pagination).toEqual({
        total: 1,
        limit: 50,
        offset: 0,
        has_more: false,
      });
    });
  });

  describe("2. Pagination & Parameter Validation", () => {
    it("applies default pagination limit=50 and offset=0", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "0" }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
      expect(res.body.pagination.offset).toBe(0);

      // Verify data query received limit 50, offset 0
      const dataCall = mockQuery.mock.calls[2];
      expect(dataCall[1]).toEqual([50, 0]);
    });

    it("respects valid custom limit and offset", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "75" }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "2", actor_id: null, document_id: null, action: "test", outcome: "success", details: {}, created_at: "2026-10-22T00:00:00Z" }],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=25&offset=10")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({
        total: 75,
        limit: 25,
        offset: 10,
        has_more: true,
      });

      const dataCall = mockQuery.mock.calls[2];
      expect(dataCall[1]).toEqual([25, 10]);
    });

    it("rejects limit less than 1 (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=0")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Limit must be an integer between 1 and 100");
    });

    it("rejects limit greater than 100 (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=101")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Limit must be an integer between 1 and 100");
    });

    it("rejects non-numeric limit (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=abc")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Limit must be an integer between 1 and 100");
    });

    it("rejects decimal limit (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=10.5")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Limit must be an integer between 1 and 100");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects leading zero limit like 05 (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?limit=05")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Limit must be an integer between 1 and 100");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects negative offset (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=-5")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
    });

    it("rejects decimal offset (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=10.5")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects leading zero offset like 05 (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=05")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects non-numeric offset (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=xyz")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
    });

    it("rejects offset exceeding Number.MAX_SAFE_INTEGER without executing audit queries (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=9007199254740992")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
      // Only mockQuery call should be the auth user lookup, not audit count/select
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects extremely long digit strings for offset without executing audit queries (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?offset=9999999999999999999999999999999999999")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Offset must be a non-negative integer");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Filtering & Parameterized SQL Queries", () => {
    it("filters by actor_id, document_id, action, outcome, start_date, and end_date", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "1" }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "50",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "file:download",
            outcome: "success",
            details: { bytes_sent: 1024 },
            created_at: "2026-10-22T08:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get(
          `/api/admin/audit-logs?actor_id=${OWNER_ID}&document_id=${DOC_ID}&action=file:download&outcome=success&start_date=2026-10-22T00:00:00.000Z&end_date=2026-10-22T23:59:59.999Z`
        )
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_logs).toHaveLength(1);

      // Verify count query structure and parameters
      const countCall = mockQuery.mock.calls[1];
      const countSql = countCall[0];
      const countParams = countCall[1];
      expect(countSql).toContain("actor_id = $1");
      expect(countSql).toContain("document_id = $2");
      expect(countSql).toContain("action = $3");
      expect(countSql).toContain("outcome = $4");
      expect(countSql).toContain("created_at >= $5");
      expect(countSql).toContain("created_at <= $6");
      expect(countParams).toEqual([
        OWNER_ID,
        DOC_ID,
        "file:download",
        "success",
        "2026-10-22T00:00:00.000Z",
        "2026-10-22T23:59:59.999Z",
      ]);

      // Verify data query structure and ordering
      const dataCall = mockQuery.mock.calls[2];
      const dataSql = dataCall[0];
      const dataParams = dataCall[1];
      expect(dataSql).toContain("ORDER BY created_at DESC, id DESC");
      expect(dataSql).toContain("LIMIT $7 OFFSET $8");
      expect(dataParams).toEqual([
        OWNER_ID,
        DOC_ID,
        "file:download",
        "success",
        "2026-10-22T00:00:00.000Z",
        "2026-10-22T23:59:59.999Z",
        50,
        0,
      ]);
    });

    it("rejects invalid actor_id UUID format (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?actor_id=not-a-uuid")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid actor_id");
    });

    it("rejects invalid document_id UUID format (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?document_id=malicious'--")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid document_id");
    });

    it("rejects invalid outcome value (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?outcome=bypassed")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid outcome");
    });

    it("rejects invalid action length (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get(`/api/admin/audit-logs?action=${"a".repeat(101)}`)
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Action must be between 1 and 100 characters");
    });

    it("rejects invalid start_date format (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?start_date=2026-99-99")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid start_date");
    });

    it("rejects invalid end_date format (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?end_date=invalid-date")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid end_date");
    });

    it("rejects date range where start_date is after end_date (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs?start_date=2026-10-25T00:00:00Z&end_date=2026-10-20T00:00:00Z")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("start_date cannot be after end_date");
    });

    it("accepts equal start_date and end_date timestamps (200)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "0" }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const sameDate = "2026-10-22T12:00:00.000Z";
      const res = await request(app)
        .get(`/api/admin/audit-logs?start_date=${sameDate}&end_date=${sameDate}`)
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain("created_at >= $1 AND created_at <= $2");
      expect(countCall[1]).toEqual([sameDate, sameDate]);
    });

    it("prevents SQL injection by treating injection payloads as literal parameter values", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "0" }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const sqlInjectionAction = "'; DROP TABLE audit_logs; --";
      const res = await request(app)
        .get(`/api/admin/audit-logs?action=${encodeURIComponent(sqlInjectionAction)}`)
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).not.toContain(sqlInjectionAction);
      expect(countCall[1]).toContain(sqlInjectionAction);
    });
  });

  describe("4. Audit Event Details (GET /api/admin/audit-logs/:id)", () => {
    it("returns 200 and audit log entry when valid ID exists", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "123",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "document:update",
            outcome: "success",
            details: { changes: { title: "Updated Title" } },
            created_at: "2026-10-22T11:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs/123")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_log).toEqual({
        id: "123",
        actor_id: OWNER_ID,
        document_id: DOC_ID,
        action: "document:update",
        outcome: "success",
        details: { changes: { title: "Updated Title" } },
        created_at: "2026-10-22T11:00:00Z",
      });

      const selectCall = mockQuery.mock.calls[1];
      expect(selectCall[0]).toContain("WHERE id = $1");
      expect(selectCall[1]).toEqual(["123"]);
    });

    it("returns 404 when audit log entry does not exist", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/admin/audit-logs/999999")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Audit log entry not found");
    });

    it("returns 400 when ID format is non-numeric", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/not-a-number")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("accepts valid ID 1 and retrieves audit log", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "document:create",
            outcome: "success",
            details: {},
            created_at: "2026-10-22T00:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs/1")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_log.id).toBe("1");
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][1]).toEqual(["1"]);
    });

    it("accepts maximum valid PostgreSQL signed BIGINT ID (9223372036854775807) as string", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "9223372036854775807",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "document:create",
            outcome: "success",
            details: {},
            created_at: "2026-10-22T00:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs/9223372036854775807")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_log.id).toBe("9223372036854775807");
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][1]).toEqual(["9223372036854775807"]);
    });

    it("rejects ID 0 without executing database queries (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/0")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects leading zero representations like 01 without executing queries (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/01")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects negative ID without executing database queries (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/-10")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects ID exceeding maximum PostgreSQL signed BIGINT (9223372036854775808) without querying database (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/9223372036854775808")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("rejects extremely long digit strings for ID without querying database (400)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      const res = await request(app)
        .get("/api/admin/audit-logs/9999999999999999999999999999999999999")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid audit log ID format");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. Append-Only Integrity & Endpoint Immutability", () => {
    it("does not expose ordinary endpoints to mutate or delete audit logs", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      const postRes = await request(app)
        .post("/api/admin/audit-logs")
        .set("Authorization", "Bearer admin-token")
        .send({ action: "tamper" });
      expect(postRes.status).toBe(404);

      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      const putRes = await request(app)
        .put("/api/admin/audit-logs/123")
        .set("Authorization", "Bearer admin-token")
        .send({ outcome: "success" });
      expect(putRes.status).toBe(404);

      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      const patchRes = await request(app)
        .patch("/api/admin/audit-logs/123")
        .set("Authorization", "Bearer admin-token")
        .send({ outcome: "failure" });
      expect(patchRes.status).toBe(404);

      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      const deleteRes = await request(app)
        .delete("/api/admin/audit-logs/123")
        .set("Authorization", "Bearer admin-token");
      expect(deleteRes.status).toBe(404);
    });

    it("does not expose password hashes or authentication secrets in audit responses", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "1",
            actor_id: OWNER_ID,
            document_id: DOC_ID,
            action: "file:download",
            outcome: "success",
            details: { client_ip: "127.0.0.1" },
            created_at: "2026-10-22T10:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs/1")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain("password_hash");
      expect(json).not.toContain("secret");
      expect(json).not.toContain("token");
    });
  });

  describe("6. Audit Persistence Failure Policy & Atomicity", () => {
    it("catches standalone audit logging failures safely without throwing or crashing", async () => {
      const { recordAuditLog } = await import("./audit.js");
      mockQuery.mockRejectedValueOnce(new Error("Database connection lost"));

      // Must not throw
      await expect(
        recordAuditLog({
          actorId: OWNER_ID,
          documentId: null,
          action: "test:standalone",
          outcome: "denied",
        })
      ).resolves.toBeUndefined();
    });

    it("propagates errors when logging inside a transaction client so transaction rolls back", async () => {
      const { recordAuditLog } = await import("./audit.js");
      const mockClient = {
        query: vi.fn().mockRejectedValueOnce(new Error("Audit trigger constraint violation")),
      } as any;

      // Must throw so caller rolls back transaction
      await expect(
        recordAuditLog({
          actorId: OWNER_ID,
          documentId: DOC_ID,
          action: "document:create",
          outcome: "success",
          client: mockClient,
        })
      ).rejects.toThrow("Audit trigger constraint violation");
    });
  });

  describe("7. Historical Audit Logs With Null or Deleted Actors", () => {
    it("safely retrieves audit logs where actor_id is null or user record was deleted", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      // Mock COUNT(*)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "2" }] });

      // Mock data query returning historical logs with deleted actor and null actor
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "201",
            actor_id: "99999999-9999-4999-8999-999999999999",
            actor_email: null, // User deleted from public.users
            actor_name: null,
            document_id: DOC_ID,
            document_title: "deleted_user_doc.pdf",
            action: "file:upload",
            outcome: "success",
            details: {},
            created_at: "2026-10-20T10:00:00Z",
          },
          {
            id: "202",
            actor_id: null, // System or unauthenticated actor
            actor_email: null,
            actor_name: null,
            document_id: null,
            document_title: null,
            action: "system:cleanup",
            outcome: "success",
            details: { cleanup_type: "orphaned_chunks" },
            created_at: "2026-10-20T11:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_logs).toHaveLength(2);
      expect(res.body.audit_logs[0].id).toBe("201");
      expect(res.body.audit_logs[0].actor_id).toBe("99999999-9999-4999-8999-999999999999");
      expect(res.body.audit_logs[0].actor_email).toBeNull();
      expect(res.body.audit_logs[1].id).toBe("202");
      expect(res.body.audit_logs[1].actor_id).toBeNull();
    });

    it("safely retrieves single audit log entry by ID when actor was deleted", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "admin@trustvault.local", role: "admin" });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "201",
            actor_id: "99999999-9999-4999-8999-999999999999",
            actor_email: null,
            actor_name: null,
            document_id: DOC_ID,
            document_title: "deleted_user_doc.pdf",
            action: "file:upload",
            outcome: "success",
            details: {},
            created_at: "2026-10-20T10:00:00Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/audit-logs/201")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.audit_log.id).toBe("201");
      expect(res.body.audit_log.actor_id).toBe("99999999-9999-4999-8999-999999999999");
      expect(res.body.audit_log.actor_email).toBeNull();
    });
  });
});

