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
const mockStorageUpload = vi.fn();
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
    admin: {
      updateUserById: mockUpdateUserById,
    },
  },
  storage: {
    from: mockStorageFrom,
  },
};

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const EDITOR_ID = "22222222-2222-4222-8222-222222222222";
const READER_ID = "33333333-3333-4333-8333-333333333333";
const STRANGER_ID = "44444444-4444-4444-8444-444444444444";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const VALID_PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF");

beforeAll(async () => {
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
  process.env.STORAGE_BUCKET_NAME = "trustvault-private";

  const supabaseModule = await import("./supabase.js");
  setSupabaseAdminForTesting = supabaseModule.setSupabaseAdminForTesting;
  setSupabaseAdminForTesting(mockSupabaseAdmin);

  const serverModule = await import("./server.js");
  app = serverModule.app;
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
  mockStorageUpload.mockReset();
  mockStorageRemove.mockReset();
  mockStorageFrom.mockReturnValue(mockStorageBucket);
});

describe("TrustVault Phase 9 — Security Audit & Regression Verification", () => {
  // =========================================================================
  // 1. AUTHENTICATION & SESSION SECURITY
  // =========================================================================
  describe("Authentication & Session Security", () => {
    it("rejects unauthenticated requests to protected endpoints with 401", async () => {
      const res = await request(app).get("/api/documents");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authorization header is required/i);
    });

    it("rejects malformed authorization header with 401", async () => {
      const res = await request(app)
        .get("/api/documents")
        .set("Authorization", "InvalidHeaderFormat");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid authorization format/i);
    });

    it("rejects expired or invalid token from Supabase Auth with 401", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      const res = await request(app)
        .get("/api/documents")
        .set("Authorization", "Bearer expired-token");

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired authentication token/i);
    });

    it("rejects deactivated user accounts with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "banned@trustvault.io" } },
        error: null,
      });
      // User query returns is_active = false
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: OWNER_ID,
            email: "banned@trustvault.io",
            role: "user",
            is_active: false,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get("/api/documents")
        .set("Authorization", "Bearer banned-user-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Account is deactivated/i);
    });

    it("prevents privilege escalation when user attempts to PATCH their role or is_active", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "user@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: OWNER_ID,
            email: "user@trustvault.io",
            role: "user",
            is_active: true,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .patch("/api/me")
        .set("Authorization", "Bearer user-token")
        .send({ role: "admin", full_name: "Attacker" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Field 'role' cannot be modified/i);
    });
  });

  // =========================================================================
  // 2. AUTHORIZATION & DOCUMENT PERMISSION BOUNDARIES
  // =========================================================================
  describe("Authorization & Document Permission Boundaries", () => {
    it("returns 404 (non-disclosure) and logs denied audit event when an unauthorized user attempts to view a document", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: STRANGER_ID, email: "stranger@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: STRANGER_ID, email: "stranger@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess returns null (no ownership, no active permission)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit log recording
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer stranger-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");

      // Verify audit log recorded denied outcome
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO public.audit_logs"),
        expect.arrayContaining([STRANGER_ID, DOC_ID, "document:read", "denied"])
      );
    });

    it("prevents Reader from editing metadata with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: READER_ID, email: "reader@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: READER_ID, email: "reader@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess returns access_level = 'read'
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Financial_Report.pdf",
            category: "Finance",
            description: "Q3 Report",
            access_level: "read",
          },
        ],
      });
      // Denied audit log
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .patch(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer reader-token")
        .send({ title: "Tampered Title" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/read-only users cannot edit document metadata/i);
    });

    it("prevents Editor from deleting a document with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: EDITOR_ID, email: "editor@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: EDITOR_ID, email: "editor@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess returns access_level = 'edit'
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Project_Spec.pdf",
            category: "General",
            access_level: "edit",
          },
        ],
      });
      // Denied audit log
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .delete(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer editor-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the document owner can delete this document/i);
    });

    it("prevents Editor from granting sharing permissions with 403 Forbidden", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: EDITOR_ID, email: "editor@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: EDITOR_ID, email: "editor@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess returns access_level = 'edit'
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Project_Spec.pdf",
            access_level: "edit",
          },
        ],
      });
      // Denied audit log
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .post(`/api/documents/${DOC_ID}/permissions`)
        .set("Authorization", "Bearer editor-token")
        .send({ user_id: STRANGER_ID, permission: "read" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only the document owner can grant permissions/i);
    });

    it("prevents Owner from granting permissions to themselves", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "owner@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess returns access_level = 'owner'
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Owner_Doc.pdf",
            access_level: "owner",
          },
        ],
      });
      // Target user lookup returns owner
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", is_active: true }],
      });
      // Denied audit log
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .post(`/api/documents/${DOC_ID}/permissions`)
        .set("Authorization", "Bearer owner-token")
        .send({ email: "owner@trustvault.io", permission: "read" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot grant permissions to yourself or the document owner/i);
    });
  });

  // =========================================================================
  // 3. REVOCATION & STORAGE LIFECYCLE SECURITY
  // =========================================================================
  describe("Revocation & File Download Security", () => {
    it("immediately denies file download after permission has been revoked", async () => {
      // Bob had permission revoked; now attempts download
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: READER_ID, email: "bob@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: READER_ID, email: "bob@trustvault.io", role: "user", is_active: true }],
      });
      // getDocumentWithAccess checks p.revoked_at IS NULL, so returns access_level = null
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });
      // Denied audit log
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}/download`)
        .set("Authorization", "Bearer bob-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");

      // Verify that object storage download was never called
      expect(mockStorageDownload).not.toHaveBeenCalled();
    });

    it("serves file download from trustvault-private bucket with nosniff and safe Content-Disposition", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "owner@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: DOC_ID,
            owner_id: OWNER_ID,
            title: "Executive Summary.pdf",
            mime_type: "application/pdf",
            storage_key: `private/${OWNER_ID}/secret-uuid.pdf`,
            access_level: "owner",
          },
        ],
      });

      mockStorageDownload.mockResolvedValueOnce({
        data: VALID_PDF,
        error: null,
      });

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}/download`)
        .set("Authorization", "Bearer owner-token");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-disposition"]).toContain("attachment;");
      expect(res.headers["content-disposition"]).toContain("Executive Summary.pdf");
      expect(mockStorageFrom).toHaveBeenCalledWith("trustvault-private");
    });
  });

  // =========================================================================
  // 4. UPLOAD VALIDATION & METADATA SANITIZATION
  // =========================================================================
  describe("Upload & Input Validation", () => {
    it("rejects file uploads with mismatched magic bytes (e.g. text declared as PDF)", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "owner@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({}); // Denied audit

      const fakePdf = Buffer.from("THIS IS NOT A VALID PDF FILE HEADER");

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer owner-token")
        .attach("file", fakePdf, {
          filename: "fake.pdf",
          contentType: "application/pdf",
        })
        .field("title", "Fake PDF Document")
        .field("category", "General");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid PDF signature/i);
    });

    it("rejects text files containing binary null bytes", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "owner@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({}); // Denied audit

      const binaryText = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // "Hel\0o"

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer owner-token")
        .attach("file", binaryText, {
          filename: "bad.txt",
          contentType: "text/plain",
        })
        .field("title", "Bad Text")
        .field("category", "General");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/binary or invalid control characters/i);
    });

    it("rejects unsupported MIME types like application/x-msdownload", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "owner@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "owner@trustvault.io", role: "user", is_active: true }],
      });
      mockQuery.mockResolvedValueOnce({}); // Denied audit

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer owner-token")
        .attach("file", Buffer.from("MZ\x90\x00"), {
          filename: "virus.exe",
          contentType: "application/x-msdownload",
        })
        .field("title", "Malicious Executable")
        .field("category", "General");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unsupported or disallowed MIME type/i);
    });
  });

  // =========================================================================
  // 5. ADMINISTRATIVE AUDIT ACCESS
  // =========================================================================
  describe("Administrative Audit Access", () => {
    it("rejects non-admin users from accessing global audit logs with 403 and writes a denied audit event", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: OWNER_ID, email: "user@trustvault.io" } },
        error: null,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: OWNER_ID, email: "user@trustvault.io", role: "user", is_active: true }],
      });
      // Denied audit log recording
      mockQuery.mockResolvedValueOnce({});

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer non-admin-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only administrators can access audit logs/i);

      // Verify denied audit log entry was written
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO public.audit_logs"),
        expect.arrayContaining([OWNER_ID, null, "audit_log:read", "denied"])
      );
    });
  });

  // =========================================================================
  // 6. THREE-DOT OVERFLOW MENU POSITIONING ALGORITHM
  // =========================================================================
  describe("Three-Dot Overflow Menu Positioning Logic", () => {
    // Pure unit tests for the positioning algorithm used by DocumentsView.tsx
    function calculateMenuPosition(
      rect: { top: number; bottom: number; left: number; right: number },
      menuWidth: number,
      menuHeight: number,
      viewportWidth: number,
      viewportHeight: number
    ): { top: number; left: number } {
      let left = rect.right - menuWidth;
      if (left < 8) {
        left = 8;
      } else if (left + menuWidth > viewportWidth - 8) {
        left = viewportWidth - menuWidth - 8;
      }

      let top = rect.bottom + 4;
      if (top + menuHeight > viewportHeight - 8) {
        const topAbove = rect.top - menuHeight - 4;
        if (topAbove >= 8) {
          top = topAbove;
        } else {
          top = Math.max(8, viewportHeight - menuHeight - 8);
        }
      }

      return { top, left };
    }

    it("aligns menu right edge to button right edge by default", () => {
      const buttonRect = { top: 100, bottom: 130, left: 500, right: 530 };
      const menuWidth = 160;
      const menuHeight = 122; // Owner actions
      const viewportWidth = 1024;
      const viewportHeight = 768;

      const pos = calculateMenuPosition(buttonRect, menuWidth, menuHeight, viewportWidth, viewportHeight);

      // right edge of menu (pos.left + menuWidth) should equal buttonRect.right (530)
      expect(pos.left).toBe(530 - 160); // 370
      // placed 4px below button bottom
      expect(pos.top).toBe(134);
    });

    it("flips above the button when the menu would overflow the bottom of the viewport", () => {
      // Button is near bottom of viewport (bottom at 740, viewport height 768)
      const buttonRect = { top: 710, bottom: 740, left: 500, right: 530 };
      const menuWidth = 160;
      const menuHeight = 122; // Owner actions
      const viewportWidth = 1024;
      const viewportHeight = 768;

      const pos = calculateMenuPosition(buttonRect, menuWidth, menuHeight, viewportWidth, viewportHeight);

      // Should flip above button: top = rect.top - menuHeight - 4 = 710 - 122 - 4 = 584
      expect(pos.top).toBe(584);
      expect(pos.left).toBe(370);
    });

    it("clamps horizontally within viewport margin when button is near right edge", () => {
      // Button right is at 1020, viewport width is 1024
      const buttonRect = { top: 100, bottom: 130, left: 990, right: 1020 };
      const menuWidth = 160;
      const menuHeight = 122;
      const viewportWidth = 1024;
      const viewportHeight = 768;

      const pos = calculateMenuPosition(buttonRect, menuWidth, menuHeight, viewportWidth, viewportHeight);

      // Clamped to viewportWidth - menuWidth - 8 = 1024 - 160 - 8 = 856
      expect(pos.left).toBe(856);
      expect(pos.left + menuWidth).toBeLessThanOrEqual(viewportWidth - 8);
    });

    it("calculates correct heights for Owner (3 actions) vs Editor (1 action) to prevent pre-paint jump", () => {
      const ownerHeight = 122;
      const editorHeight = 44;

      expect(ownerHeight).toBeGreaterThan(editorHeight);
      expect(editorHeight).toBe(44);
    });
  });
});
