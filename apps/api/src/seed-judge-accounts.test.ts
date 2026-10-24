import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validatePassword,
  validateJudgeDemoConfig,
  seedJudgeAccounts,
} from "../scripts/seed-judge-accounts.js";

// Suppress console.log and console.error output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function assertDefined<T>(val: T, message: string): asserts val is NonNullable<T> {
  expect(val).toBeDefined();
  if (val === undefined || val === null) {
    throw new Error(message);
  }
}

describe("Judge Demo Accounts Seeding Configuration & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ENABLE_DEMO_ACCOUNTS Gate", () => {
    it("should refuse to seed when ENABLE_DEMO_ACCOUNTS is undefined or empty", () => {
      expect(() =>
        validateJudgeDemoConfig({
          DEMO_ADMIN_PASSWORD: "AdminPassword123!",
          DEMO_OWNER_PASSWORD: "OwnerPassword123!",
          DEMO_VIEWER_PASSWORD: "ViewerPassword123!",
        })
      ).toThrowError(/Demo account seeding is disabled\. Set ENABLE_DEMO_ACCOUNTS=true/);
    });

    it("should refuse to seed when ENABLE_DEMO_ACCOUNTS is 'false'", () => {
      expect(() =>
        validateJudgeDemoConfig({
          ENABLE_DEMO_ACCOUNTS: "false",
          DEMO_ADMIN_PASSWORD: "AdminPassword123!",
          DEMO_OWNER_PASSWORD: "OwnerPassword123!",
          DEMO_VIEWER_PASSWORD: "ViewerPassword123!",
        })
      ).toThrowError(/Demo account seeding is disabled/);
    });

    it("should refuse to seed when ENABLE_DEMO_ACCOUNTS has an invalid value", () => {
      expect(() =>
        validateJudgeDemoConfig({
          ENABLE_DEMO_ACCOUNTS: "yes",
          DEMO_ADMIN_PASSWORD: "AdminPassword123!",
          DEMO_OWNER_PASSWORD: "OwnerPassword123!",
          DEMO_VIEWER_PASSWORD: "ViewerPassword123!",
        })
      ).toThrowError(/Demo account seeding is disabled/);
    });
  });

  describe("Password Presence and Security Validation", () => {
    const validBaseEnv = {
      ENABLE_DEMO_ACCOUNTS: "true",
      DEMO_ADMIN_PASSWORD: "AdminPassword123!",
      DEMO_OWNER_PASSWORD: "OwnerPassword123!",
      DEMO_VIEWER_PASSWORD: "ViewerPassword123!",
    };

    it("should reject when DEMO_ADMIN_PASSWORD is missing", () => {
      const env = { ...validBaseEnv, DEMO_ADMIN_PASSWORD: "" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_ADMIN_PASSWORD environment variable is required/
      );
    });

    it("should reject when DEMO_ADMIN_PASSWORD is shorter than 8 characters", () => {
      const env = { ...validBaseEnv, DEMO_ADMIN_PASSWORD: "short" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_ADMIN_PASSWORD must be at least 8 characters long/
      );
    });

    it("should reject when DEMO_OWNER_PASSWORD is missing", () => {
      const env = { ...validBaseEnv, DEMO_OWNER_PASSWORD: "" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_OWNER_PASSWORD environment variable is required/
      );
    });

    it("should reject when DEMO_OWNER_PASSWORD is shorter than 8 characters", () => {
      const env = { ...validBaseEnv, DEMO_OWNER_PASSWORD: "12345" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_OWNER_PASSWORD must be at least 8 characters long/
      );
    });

    it("should reject when DEMO_VIEWER_PASSWORD is missing", () => {
      const env = { ...validBaseEnv, DEMO_VIEWER_PASSWORD: "" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_VIEWER_PASSWORD environment variable is required/
      );
    });

    it("should reject when DEMO_VIEWER_PASSWORD is shorter than 8 characters", () => {
      const env = { ...validBaseEnv, DEMO_VIEWER_PASSWORD: "pass" };
      expect(() => validateJudgeDemoConfig(env)).toThrowError(
        /DEMO_VIEWER_PASSWORD must be at least 8 characters long/
      );
    });

    it("should refuse fallback to legacy DEMO_PASSWORD when individual passwords are not set", () => {
      const legacyEnv = {
        ENABLE_DEMO_ACCOUNTS: "true",
        DEMO_PASSWORD: "SharedPassword123!",
      };
      expect(() => validateJudgeDemoConfig(legacyEnv)).toThrowError(
        /DEMO_ADMIN_PASSWORD environment variable is required/
      );
    });

    it("should successfully validate config when all requirements are met", () => {
      const config = validateJudgeDemoConfig(validBaseEnv);
      expect(config.adminEmail).toBe("demo.admin@trustvault.local");
      expect(config.ownerEmail).toBe("demo.owner@trustvault.local");
      expect(config.viewerEmail).toBe("demo.viewer@trustvault.local");
      expect(config.adminPassword).toBe("AdminPassword123!");
      expect(config.ownerPassword).toBe("OwnerPassword123!");
      expect(config.viewerPassword).toBe("ViewerPassword123!");
    });
  });

  describe("Separate Password Assignment and Role Provisioning", () => {
    it("should pass distinct separate passwords to each respective account during creation", async () => {
      const env = {
        ENABLE_DEMO_ACCOUNTS: "true",
        DEMO_ADMIN_PASSWORD: "DistinctAdminPass123!",
        DEMO_OWNER_PASSWORD: "DistinctOwnerPass456!",
        DEMO_VIEWER_PASSWORD: "DistinctViewerPass789!",
      };

      const mockCreateUser = vi.fn().mockImplementation(({ email, password }) => {
        const id = `user-id-${email.split("@")[0].replace(".", "-")}`;
        return Promise.resolve({ data: { user: { id, email } }, error: null });
      });

      const mockListUsers = vi.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      });

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: mockListUsers,
            createUser: mockCreateUser,
            updateUserById: vi.fn(),
          },
        },
      };

      const dbRows: any[] = [];
      const mockQuery = vi.fn().mockImplementation((queryText: string, params: any[]) => {
        if (queryText.includes("INSERT INTO public.users")) {
          const [id, email, fullName, role] = params;
          const row = { id, email, full_name: fullName, role, is_active: true };
          dbRows.push(row);
          return Promise.resolve({ rows: [row] });
        }
        if (queryText.includes("SELECT id FROM public.documents")) {
          return Promise.resolve({ rows: [] });
        }
        if (queryText.includes("INSERT INTO public.documents")) {
          return Promise.resolve({ rows: [{ id: "doc-uuid-demo-1234", title: "TrustVault_Security_Evaluation_Guide.pdf" }] });
        }
        if (queryText.includes("SELECT id, permission FROM public.document_permissions")) {
          return Promise.resolve({ rows: [] });
        }
        if (queryText.includes("INSERT INTO public.document_permissions")) {
          return Promise.resolve({ rows: [{ id: "perm-uuid-demo-5678" }] });
        }
        if (queryText.includes("INSERT INTO public.audit_logs")) {
          return Promise.resolve({ rows: [{ id: "audit-1" }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const mockPool = { query: mockQuery };

      const result = await seedJudgeAccounts({
        env,
        dbPool: mockPool,
        supabaseClient: mockSupabase,
      });

      // 1. Verify separate passwords passed to Supabase
      expect(mockCreateUser).toHaveBeenCalledTimes(3);

      const adminCall = mockCreateUser.mock.calls.find(
        (c) => c[0].email === "demo.admin@trustvault.local"
      );
      assertDefined(adminCall, "Expected Supabase createUser call for demo.admin@trustvault.local");
      expect(adminCall[0].password).toBe("DistinctAdminPass123!");

      const ownerCall = mockCreateUser.mock.calls.find(
        (c) => c[0].email === "demo.owner@trustvault.local"
      );
      assertDefined(ownerCall, "Expected Supabase createUser call for demo.owner@trustvault.local");
      expect(ownerCall[0].password).toBe("DistinctOwnerPass456!");

      const viewerCall = mockCreateUser.mock.calls.find(
        (c) => c[0].email === "demo.viewer@trustvault.local"
      );
      assertDefined(viewerCall, "Expected Supabase createUser call for demo.viewer@trustvault.local");
      expect(viewerCall[0].password).toBe("DistinctViewerPass789!");

      // 2. Verify correct roles assigned in database
      expect(result.admin.role).toBe("admin");
      expect(result.owner.role).toBe("owner");
      expect(result.viewer.role).toBe("viewer");

      const userQueries = mockQuery.mock.calls.filter((c) =>
        c[0].includes("INSERT INTO public.users")
      );
      expect(userQueries).toHaveLength(3);

      const adminDbCall = userQueries.find((c) => c[1][1] === "demo.admin@trustvault.local");
      assertDefined(adminDbCall, "Expected database query for demo.admin@trustvault.local");
      expect(adminDbCall[1][3]).toBe("admin");

      const ownerDbCall = userQueries.find((c) => c[1][1] === "demo.owner@trustvault.local");
      assertDefined(ownerDbCall, "Expected database query for demo.owner@trustvault.local");
      expect(ownerDbCall[1][3]).toBe("owner");

      const viewerDbCall = userQueries.find((c) => c[1][1] === "demo.viewer@trustvault.local");
      assertDefined(viewerDbCall, "Expected database query for demo.viewer@trustvault.local");
      expect(viewerDbCall[1][3]).toBe("viewer");
    });
  });

  describe("Safe Repeat Execution (Idempotency)", () => {
    it("should update existing users, reuse existing sample document, and not create duplicate permissions", async () => {
      const env = {
        ENABLE_DEMO_ACCOUNTS: "true",
        DEMO_ADMIN_PASSWORD: "AdminNewPassword123!",
        DEMO_OWNER_PASSWORD: "OwnerNewPassword123!",
        DEMO_VIEWER_PASSWORD: "ViewerNewPassword123!",
      };

      const existingUsers = [
        { id: "admin-existing-id", email: "demo.admin@trustvault.local" },
        { id: "owner-existing-id", email: "demo.owner@trustvault.local" },
        { id: "viewer-existing-id", email: "demo.viewer@trustvault.local" },
      ];

      const mockUpdateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockCreateUser = vi.fn();
      const mockListUsers = vi.fn().mockResolvedValue({
        data: { users: existingUsers },
        error: null,
      });

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: mockListUsers,
            createUser: mockCreateUser,
            updateUserById: mockUpdateUserById,
          },
        },
      };

      const mockQuery = vi.fn().mockImplementation((queryText: string, params: any[]) => {
        if (queryText.includes("INSERT INTO public.users")) {
          const [id, email, fullName, role] = params;
          return Promise.resolve({
            rows: [{ id, email, full_name: fullName, role, is_active: true }],
          });
        }
        if (queryText.includes("SELECT id FROM public.documents")) {
          // Document already exists
          return Promise.resolve({ rows: [{ id: "existing-doc-999" }] });
        }
        if (queryText.includes("INSERT INTO public.documents")) {
          throw new Error("Duplicate document insert should not occur!");
        }
        if (queryText.includes("SELECT id, permission FROM public.document_permissions")) {
          // Permission already exists
          return Promise.resolve({ rows: [{ id: "existing-perm-888", permission: "read" }] });
        }
        if (queryText.includes("INSERT INTO public.document_permissions")) {
          throw new Error("Duplicate permission insert should not occur!");
        }
        return Promise.resolve({ rows: [] });
      });

      const mockPool = { query: mockQuery };

      const result = await seedJudgeAccounts({
        env,
        dbPool: mockPool,
        supabaseClient: mockSupabase,
      });

      // 1. Existing users updated, not created
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockUpdateUserById).toHaveBeenCalledTimes(3);

      expect(mockUpdateUserById).toHaveBeenCalledWith(
        "admin-existing-id",
        expect.objectContaining({ password: "AdminNewPassword123!" })
      );
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        "owner-existing-id",
        expect.objectContaining({ password: "OwnerNewPassword123!" })
      );
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        "viewer-existing-id",
        expect.objectContaining({ password: "ViewerNewPassword123!" })
      );

      // 2. Existing demo document was reused
      expect(result.documentId).toBe("existing-doc-999");
      expect(result.admin.role).toBe("admin");
      expect(result.owner.role).toBe("owner");
      expect(result.viewer.role).toBe("viewer");
    });
  });
});
