import { describe, it, expect, vi, beforeAll } from "vitest";
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

let app: any;

beforeAll(async () => {
  const mod = await import("./server.js");
  app = mod.default;
});

describe("Security middleware", () => {
  it("should set X-Content-Type-Options header via Helmet", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should set X-Frame-Options header via Helmet", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("should not expose X-Powered-By header", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("should include Access-Control-Allow-Origin for configured origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("should not reflect an arbitrary origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("Health check", () => {
  it('should return 200 { status: "ok" } when database is reachable', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return 503 { status: "degraded" } when database is unreachable', async () => {
    mockQuery.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.error).toBe("Database connection unavailable");
  });
});

describe("Request handling & Error safety", () => {
  it("should return 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/non-existent-endpoint");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Route not found" });
  });

  it("should reject payloads exceeding 2 MB with 413", async () => {
    const oversized = "x".repeat(3 * 1024 * 1024);
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: oversized }));

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("Payload too large");
  });

  it("should safely handle malformed JSON syntax with 400 Bad Request", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{ invalid-json-payload ");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid JSON payload");
  });
});
