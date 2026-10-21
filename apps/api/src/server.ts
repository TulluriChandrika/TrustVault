import "./env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./db/pool.js";

const app = express();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || "4000", 10);
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .trim()
  .replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// Security headers — Helmet sets reasonable defaults for X-Content-Type-Options,
// Strict-Transport-Security, X-Frame-Options, etc.
app.use(helmet());

// Rate limiting — in-memory store; suitable for single-instance deployments.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", process.env.TRUST_PROXY);
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // limit each IP to 100 requests per window
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  })
);

// Parse JSON request bodies (limit protects against oversized payloads)
app.use(express.json({ limit: "2mb" }));

// CORS — allow configured frontend origin, reject unauthorized origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as curl, mobile, or server-to-server)
      if (!origin || origin === FRONTEND_ORIGIN) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Health check — unauthenticated, used for uptime monitoring
//
// This endpoint checks both server liveness and database readiness.
// If the database is unreachable, the response indicates degraded status (503)
// so that load balancers and monitoring can react appropriately.
// ---------------------------------------------------------------------------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      error: "Database connection unavailable",
    });
  }
});

// ---------------------------------------------------------------------------
// Placeholder for future route mounting
// e.g. app.use("/api/auth", authRouter);
// e.g. app.use("/api/documents", documentsRouter);
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 404 handler for unknown routes
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------------------------------------------------------------------------
// Global error handling middleware
// ---------------------------------------------------------------------------
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && "body" in err)) {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  if (err.status === 413 || err.type === "entity.too.large") {
    res.status(413).json({ error: "Payload too large" });
    return;
  }

  const statusCode = typeof err.status === "number" ? err.status : 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal server error" : (err.message || "An error occurred"),
  });
});

// ---------------------------------------------------------------------------
// Server startup and graceful shutdown
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`TrustVault API listening on http://localhost:${PORT}`);
    console.log(`  CORS origin: ${FRONTEND_ORIGIN}`);
    console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
  });

  async function shutdown(signal: string) {
    console.log(`\n${signal} received — shutting down gracefully…`);
    server.close(async () => {
      try {
        await pool.end();
        console.log("Database pool closed.");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Error closing database pool:", message);
      }
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export default app;
