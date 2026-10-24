import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Mock database pool before importing server
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockEnd = vi.fn();

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
const mockStorageDownload = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
    admin: {
      updateUserById: vi.fn(),
    },
  },
  storage: {
    from: vi.fn().mockReturnValue({
      download: mockStorageDownload,
    }),
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

// RFC 4122 v4 compliant test user and document identifiers
const ADMIN_ID = "11111111-1111-4111-a111-111111111111";
const OWNER_ID = "22222222-2222-4222-a222-222222222222";
const VIEWER_ID = "33333333-3333-4333-a333-333333333333";
const LEGACY_USER_ID = "44444444-4444-4444-a444-444444444444";
const DEACTIVATED_ID = "55555555-5555-4555-a555-555555555555";
const STRANGER_ID = "66666666-6666-4666-a666-666666666666";

const DOC_ID = "a0000000-0000-4000-a000-000000000001";
const UNRELATED_DOC_ID = "b0000000-0000-4000-a000-000000000002";

function mockAuthAs(user: {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer" | "user";
  is_active?: boolean;
}) {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: `Test ${user.role}` },
      },
    },
    error: null,
  });

  // DB lookup in requireAuth middleware
  mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes("INSERT INTO public.users")) {
      return {
        rows: [
          {
            id: user.id,
            email: user.email,
            full_name: `Test ${user.role}`,
            role: user.role,
            is_active: user.is_active ?? true,
            created_at: new Date("2026-10-24T12:00:00Z"),
          },
        ],
      };
    }
    // Audit logs standalone write
    if (sql.includes("INSERT INTO public.audit_logs")) {
      return { rows: [{ id: 101 }] };
    }
    return { rows: [] };
  });
}

describe("TrustVault — Global Role Model Verification (Admin, Owner, Viewer)", () => {
  // =========================================================================
  // 1. Admin Role Capabilities & Boundaries
  // =========================================================================
  describe("1. Admin Role (admin)", () => {
    it("allows admin access to administrative audit console (/api/admin/audit-logs)", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "demo.admin@trustvault.local", role: "admin" });

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: ADMIN_ID,
                email: "demo.admin@trustvault.local",
                role: "admin",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("SELECT COUNT(*)")) {
          return { rows: [{ total: "1" }] };
        }
        if (sql.includes("FROM public.audit_logs")) {
          return {
            rows: [
              {
                id: "1",
                actor_id: OWNER_ID,
                action: "document:create",
                outcome: "success",
                details: {},
                created_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer valid-admin-token");

      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it("rejects non-admin (owner) from administrative console with 403 Forbidden", async () => {
      mockAuthAs({ id: OWNER_ID, email: "demo.owner@trustvault.local", role: "owner" });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer valid-owner-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only administrators can access audit logs/i);
    });

    it("rejects non-admin (viewer) from administrative console with 403 Forbidden", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .get("/api/admin/audit-logs")
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only administrators can access audit logs/i);
    });

    it("does not grant admin automatic bypass to download unshared documents of other users", async () => {
      mockAuthAs({ id: ADMIN_ID, email: "demo.admin@trustvault.local", role: "admin" });

      // getDocumentWithAccess returns null for unshared document
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: ADMIN_ID,
                email: "demo.admin@trustvault.local",
                role: "admin",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("SELECT") && sql.includes("FROM public.documents")) {
          return { rows: [] }; // No row returned for unshared document
        }
        if (sql.includes("INSERT INTO public.audit_logs")) {
          return { rows: [{ id: 102 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get(`/api/documents/${UNRELATED_DOC_ID}/download`)
        .set("Authorization", "Bearer valid-admin-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");
    });
  });

  // =========================================================================
  // 2. Owner Role Capabilities & Authorization
  // =========================================================================
  describe("2. Document Owner Role (owner)", () => {
    it("allows owner to upload documents (POST /api/documents)", async () => {
      mockAuthAs({ id: OWNER_ID, email: "demo.owner@trustvault.local", role: "owner" });

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("INSERT INTO public.documents")) {
            return {
              rows: [
                {
                  id: DOC_ID,
                  owner_id: OWNER_ID,
                  title: "Q4_Financial_Audit.pdf",
                  category: "Finance",
                  description: "Quarterly report",
                  mime_type: "application/pdf",
                  size_bytes: 1024,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO public.audit_logs")) {
            return { rows: [{ id: 103 }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer valid-owner-token")
        .send({
          title: "Q4_Financial_Audit.pdf",
          category: "Finance",
          description: "Quarterly report",
          mime_type: "application/pdf",
          size_bytes: 1024,
        });

      expect(res.status).toBe(201);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.title).toBe("Q4_Financial_Audit.pdf");
      expect(res.body.document.access_level).toBe("owner");
    });

    it("allows owner to edit metadata of a document they own", async () => {
      mockAuthAs({ id: OWNER_ID, email: "demo.owner@trustvault.local", role: "owner" });

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("UPDATE public.documents")) {
            return {
              rows: [
                {
                  id: DOC_ID,
                  owner_id: OWNER_ID,
                  title: "Updated_Report.pdf",
                  category: "Finance",
                  description: "Updated description",
                  mime_type: "application/pdf",
                  size_bytes: 1024,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO public.audit_logs")) {
            return { rows: [{ id: 104 }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: OWNER_ID,
                email: "demo.owner@trustvault.local",
                role: "owner",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return {
            rows: [
              {
                id: DOC_ID,
                owner_id: OWNER_ID,
                title: "Original_Report.pdf",
                category: "Finance",
                access_level: "owner",
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .patch(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer valid-owner-token")
        .send({ title: "Updated_Report.pdf" });

      expect(res.status).toBe(200);
      expect(res.body.document.title).toBe("Updated_Report.pdf");
    });

    it("allows owner to delete a document they own", async () => {
      mockAuthAs({ id: OWNER_ID, email: "demo.owner@trustvault.local", role: "owner" });

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("UPDATE public.documents SET deleted_at = now()")) {
            return { rows: [{ id: DOC_ID }] };
          }
          if (sql.includes("INSERT INTO public.audit_logs")) {
            return { rows: [{ id: 105 }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: OWNER_ID,
                email: "demo.owner@trustvault.local",
                role: "owner",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return {
            rows: [
              {
                id: DOC_ID,
                owner_id: OWNER_ID,
                title: "Document_To_Delete.pdf",
                access_level: "owner",
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .delete(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer valid-owner-token");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Document deleted successfully");
    });

    it("allows owner to grant document sharing permissions to a viewer", async () => {
      mockAuthAs({ id: OWNER_ID, email: "demo.owner@trustvault.local", role: "owner" });

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("INSERT INTO public.document_permissions")) {
            return {
              rows: [
                {
                  id: "grant-uuid-1",
                  document_id: DOC_ID,
                  user_id: VIEWER_ID,
                  permission: "read",
                  granted_by: OWNER_ID,
                  granted_at: new Date(),
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO public.audit_logs")) {
            return { rows: [{ id: 106 }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: OWNER_ID,
                email: "demo.owner@trustvault.local",
                role: "owner",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return {
            rows: [
              {
                id: DOC_ID,
                owner_id: OWNER_ID,
                title: "Report.pdf",
                access_level: "owner",
              },
            ],
          };
        }
        if (sql.includes("FROM public.users WHERE email = $1")) {
          return {
            rows: [
              {
                id: VIEWER_ID,
                email: "demo.viewer@trustvault.local",
                is_active: true,
              },
            ],
          };
        }
        if (sql.includes("SELECT id, permission FROM public.document_permissions")) {
          return { rows: [] }; // No existing active grant
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post(`/api/documents/${DOC_ID}/permissions`)
        .set("Authorization", "Bearer valid-owner-token")
        .send({ email: "demo.viewer@trustvault.local", permission: "read" });

      expect(res.status).toBe(201);
      expect(res.body.permission.permission).toBe("read");
      expect(res.body.permission.user_email).toBe("demo.viewer@trustvault.local");
    });
  });

  // =========================================================================
  // 3. Viewer Role Restrictions (Strict Read-Only Enforcement)
  // =========================================================================
  describe("3. Read-Only Viewer Role (viewer)", () => {
    it("strictly blocks viewer from uploading documents (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer valid-viewer-token")
        .send({
          title: "Malicious_Upload_Attempt.pdf",
          category: "General",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and are not permitted to upload documents/i);
    });

    it("strictly blocks viewer from editing document metadata (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .patch(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer valid-viewer-token")
        .send({ title: "Renamed_By_Viewer.pdf" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and are not permitted to edit document metadata/i);
    });

    it("strictly blocks viewer from deleting documents (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .delete(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and are not permitted to delete documents/i);
    });

    it("strictly blocks viewer from granting document permissions (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .post(`/api/documents/${DOC_ID}/permissions`)
        .set("Authorization", "Bearer valid-viewer-token")
        .send({ email: "stranger@example.com", permission: "read" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and cannot grant document permissions/i);
    });

    it("strictly blocks viewer from revoking document permissions (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .delete(`/api/documents/${DOC_ID}/permissions/${STRANGER_ID}`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and cannot revoke document permissions/i);
    });

    it("strictly blocks viewer from listing document permissions (403 Forbidden)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}/permissions`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Viewers have read-only access and cannot view document permissions/i);
    });

    it("allows viewer to view metadata of a document actively shared with them (200 OK)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: VIEWER_ID,
                email: "demo.viewer@trustvault.local",
                role: "viewer",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return {
            rows: [
              {
                id: DOC_ID,
                owner_id: OWNER_ID,
                owner_email: "demo.owner@trustvault.local",
                owner_name: "Judge Document Owner",
                title: "Shared_Policy_Manual.pdf",
                category: "Legal",
                description: "Company policy",
                mime_type: "application/pdf",
                size_bytes: 2048,
                created_at: new Date(),
                updated_at: new Date(),
                access_level: "read",
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO public.audit_logs")) {
          return { rows: [{ id: 107 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(200);
      expect(res.body.document.title).toBe("Shared_Policy_Manual.pdf");
      expect(res.body.document.access_level).toBe("read");
    });

    it("allows viewer to download a private document actively shared with them (200 OK)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: VIEWER_ID,
                email: "demo.viewer@trustvault.local",
                role: "viewer",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return {
            rows: [
              {
                id: DOC_ID,
                owner_id: OWNER_ID,
                title: "Quarterly_Audit.pdf",
                mime_type: "application/pdf",
                storage_key: `private/${OWNER_ID}/file.pdf`,
                size_bytes: 12,
                access_level: "read",
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO public.audit_logs")) {
          return { rows: [{ id: 108 }] };
        }
        return { rows: [] };
      });

      mockStorageDownload.mockResolvedValueOnce({
        data: Buffer.from("%PDF-1.4 mock file"),
        error: null,
      });

      const res = await request(app)
        .get(`/api/documents/${DOC_ID}/download`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.body.toString()).toBe("%PDF-1.4 mock file");
    });

    it("blocks viewer from accessing unshared document (404 Not Found anti-enumeration)", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("INSERT INTO public.users")) {
          return {
            rows: [
              {
                id: VIEWER_ID,
                email: "demo.viewer@trustvault.local",
                role: "viewer",
                is_active: true,
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes("FROM public.documents d")) {
          return { rows: [] }; // No row returned for unshared document
        }
        if (sql.includes("INSERT INTO public.audit_logs")) {
          return { rows: [{ id: 109 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get(`/api/documents/${UNRELATED_DOC_ID}/download`)
        .set("Authorization", "Bearer valid-viewer-token");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Document not found");
    });
  });

  // =========================================================================
  // 4. Privilege Escalation & Profile Integrity
  // =========================================================================
  describe("4. Privilege Escalation Protections", () => {
    it("rejects user attempt to change role via PATCH /api/auth/me", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .patch("/api/auth/me")
        .set("Authorization", "Bearer valid-viewer-token")
        .send({ role: "admin" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Field 'role' cannot be modified by user/i);
    });

    it("rejects user attempt to change role via PATCH /api/me", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .patch("/api/me")
        .set("Authorization", "Bearer valid-viewer-token")
        .send({ role: "owner", full_name: "Attacker" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Field 'role' cannot be modified by user/i);
    });

    it("ignores client role injection in headers during token resolution", async () => {
      mockAuthAs({ id: VIEWER_ID, email: "demo.viewer@trustvault.local", role: "viewer" });

      const res = await request(app)
        .get("/api/me")
        .set("Authorization", "Bearer valid-viewer-token")
        .set("X-User-Role", "admin");

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("viewer");
    });
  });

  // =========================================================================
  // 5. Existing Accounts & Backward Compatibility
  // =========================================================================
  describe("5. Existing Accounts & Backward Compatibility", () => {
    it("preserves full document owner capabilities for accounts with legacy 'user' role", async () => {
      mockAuthAs({ id: LEGACY_USER_ID, email: "existing.user@trustvault.local", role: "user" });

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
          if (sql.includes("INSERT INTO public.documents")) {
            return {
              rows: [
                {
                  id: DOC_ID,
                  owner_id: LEGACY_USER_ID,
                  title: "Legacy_User_Doc.pdf",
                  category: "General",
                  mime_type: "application/pdf",
                  size_bytes: 512,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO public.audit_logs")) {
            return { rows: [{ id: 110 }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      mockConnect.mockResolvedValue(mockClient);

      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", "Bearer valid-legacy-user-token")
        .send({
          title: "Legacy_User_Doc.pdf",
          category: "General",
          mime_type: "application/pdf",
          size_bytes: 512,
        });

      expect(res.status).toBe(201);
      expect(res.body.document.title).toBe("Legacy_User_Doc.pdf");
      expect(res.body.document.access_level).toBe("owner");
    });
  });

  // =========================================================================
  // 6. Account Status Enforcement (Deactivated Accounts)
  // =========================================================================
  describe("6. Account Deactivation Enforcement", () => {
    it("blocks deactivated accounts with 403 Forbidden across all endpoints", async () => {
      mockAuthAs({
        id: DEACTIVATED_ID,
        email: "deactivated@trustvault.local",
        role: "owner",
        is_active: false,
      });

      const res = await request(app)
        .get("/api/me")
        .set("Authorization", "Bearer valid-deactivated-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Account is deactivated/i);
    });
  });
});
