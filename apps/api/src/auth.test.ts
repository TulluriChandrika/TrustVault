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

// Suppress console.log during tests
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

describe("Phase 4 Authentication & User Provisioning (/api/me)", () => {
  // Case 1: Missing token
  it("rejects request with missing Authorization header (401)", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization header is required");
  });

  // Case 2: Malformed tokens
  it("rejects request with Basic scheme instead of Bearer (401)", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid authorization format. Expected 'Bearer <token>'");
  });

  it("rejects request with empty Bearer token (401)", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid authorization format. Expected 'Bearer <token>'");
  });

  // Case 3: Invalid token
  it("rejects invalid Supabase access token (401)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Invalid JWT token signature", status: 401 },
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer invalid-token-xyz");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired authentication token");
    expect(mockGetUser).toHaveBeenCalledWith("invalid-token-xyz");
  });

  // Case 4: Expired token
  it("rejects expired Supabase access token (401)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "JWT expired", status: 401 },
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer expired-token-abc");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired authentication token");
  });

  // Case 5: Missing application user (Safe Idempotent Provisioning)
  it("safely provisions a new user with default role 'owner' and is_active: true", async () => {
    const newUserId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const newUserEmail = "newuser@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: newUserId,
          email: newUserEmail,
        },
      },
      error: null,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: newUserId,
          email: newUserEmail,
          role: "owner",
          is_active: true,
          created_at: new Date("2026-10-21T12:00:00Z"),
        },
      ],
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token-newuser");

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: newUserId,
      email: newUserEmail,
      role: "owner",
      is_active: true,
      created_at: "2026-10-21T12:00:00.000Z",
    });

    // Verify SQL query does not allow client role selection and uses ON CONFLICT
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sqlQuery = mockQuery.mock.calls[0][0];
    const sqlParams = mockQuery.mock.calls[0][1];
    expect(sqlQuery).toContain("INSERT INTO public.users");
    expect(sqlQuery).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sqlParams[0]).toBe(newUserId);
    expect(sqlParams[1]).toBe(newUserEmail);
  });

  // Case 6: Inactive application user rejected
  it("rejects inactive users with 403 Forbidden without automatic reactivation", async () => {
    const inactiveUserId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    const inactiveEmail = "deactivated@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: inactiveUserId,
          email: inactiveEmail,
        },
      },
      error: null,
    });

    // DB returns user with is_active = false
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: inactiveUserId,
          email: inactiveEmail,
          role: "owner",
          is_active: false,
          created_at: new Date("2026-10-20T10:00:00Z"),
        },
      ],
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token-inactive");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account is deactivated");
    expect(res.body.user).toBeUndefined();
  });

  // Case 7: Valid active user
  it("returns user profile for valid active user", async () => {
    const activeUserId = "c3d4e5f6-a7b8-9012-cdef-123456789012";
    const activeEmail = "activeuser@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: activeUserId,
          email: activeEmail,
        },
      },
      error: null,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: activeUserId,
          email: activeEmail,
          role: "admin",
          is_active: true,
          created_at: new Date("2026-10-19T08:00:00Z"),
        },
      ],
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token-active");

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
    expect(res.body.user.is_active).toBe(true);
    expect(res.body.user.id).toBe(activeUserId);
  });

  // Case 8: Attempted role escalation
  it("ignores client attempts to escalate role via request headers, query, or body", async () => {
    const normalUserId = "d4e5f6a7-b8c9-0123-defa-123456789012";
    const normalEmail = "normaluser@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: normalUserId,
          email: normalEmail,
        },
      },
      error: null,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: normalUserId,
          email: normalEmail,
          role: "owner", // DB assigns or preserves 'owner'
          is_active: true,
          created_at: new Date("2026-10-21T09:00:00Z"),
        },
      ],
    });

    const res = await request(app)
      .get("/api/me?role=admin")
      .set("Authorization", "Bearer valid-token-escalation-attempt")
      .set("X-User-Role", "admin");

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("owner");
    expect(res.body.user.role).not.toBe("admin");
  });

  // Case 9: Safe API response (never exposes password_hash or internal secrets)
  it("strictly excludes password_hash and internal credentials from API response", async () => {
    const userId = "e5f6a7b8-c9d0-1234-efab-123456789012";
    const email = "securitycheck@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: userId,
          email: email,
        },
      },
      error: null,
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: userId,
          email: email,
          role: "owner",
          is_active: true,
          created_at: new Date("2026-10-21T11:00:00Z"),
          password_hash: "SUPABASE_AUTH_MANAGED", // Even if DB returned it, it must not be in response
        },
      ],
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-token-leak-check");

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.secret).toBeUndefined();
    expect(res.body.password_hash).toBeUndefined();
    expect(Object.keys(res.body.user).sort()).toEqual([
      "created_at",
      "email",
      "id",
      "is_active",
      "role",
    ]);
  });

  // Case 10: Missing email on authenticated Supabase user
  it("rejects verified user without email with 400 and does not provision in DB", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "no-email-user-uuid-12345",
          // email missing or empty
        },
      },
      error: null,
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer token-without-email");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Authenticated user must have an associated email");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // Case 11: Email collision during provisioning (PostgreSQL 23505 unique violation)
  it("returns 409 Conflict when user email is already associated with another account", async () => {
    const conflictingUserId = "conflict-uuid-9876-5432-109876543210";
    const existingEmail = "already-registered@example.com";

    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: conflictingUserId,
          email: existingEmail,
        },
      },
      error: null,
    });

    const pgUniqueError = new Error('duplicate key value violates unique constraint "users_email_key"');
    (pgUniqueError as any).code = "23505";
    mockQuery.mockRejectedValueOnce(pgUniqueError);

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer token-colliding-email");

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Email address is already associated with another TrustVault account");
    expect(res.body.user).toBeUndefined();
    // Ensure no raw SQL error details or stack traces are leaked
    expect((res.body as any).detail).toBeUndefined();
    expect((res.body as any).code).toBeUndefined();
  });
});

