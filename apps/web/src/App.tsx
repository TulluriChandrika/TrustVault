import { useState } from "react";

interface HealthResponse {
  status: string;
  timestamp?: string;
  error?: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkApiHealth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("http://localhost:4000/health");
      const data = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to connect to API");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="header">
        <div className="logo-badge">
          <div className="logo-icon">T</div>
          <span className="logo-title">TrustVault</span>
        </div>
        <div className="badge-phase">Phase 2 — Baseline Ready</div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Secure Document Sharing with a Real Audit Trail</h1>
          <p>
            Cryptographically robust authorization, per-document access controls, and tamper-evident audit logging.
          </p>
        </section>

        <div className="grid">
          <div className="card">
            <div className="card-status">
              <span className="status-dot"></span>
              <span>Online & Configured</span>
            </div>
            <h3>Frontend Baseline</h3>
            <p>React 19, TypeScript, and Vite configured under npm workspaces with strict type safety.</p>
          </div>

          <div className="card">
            <div className="card-status">
              <span className="status-dot"></span>
              <span>Hardened API</span>
            </div>
            <h3>Express 5 Backend</h3>
            <p>Helmet security headers, rate limiting, JSON payload protection, and structured health check.</p>
          </div>

          <div className="card">
            <div className="card-status">
              <span className="status-dot"></span>
              <span>Connected</span>
            </div>
            <h3>Supabase PostgreSQL</h3>
            <p>Connection pool configured with strict timeouts and verified read-only diagnostic probe.</p>
          </div>
        </div>

        <div style={{ marginTop: "3rem", textAlign: "center" }}>
          <button id="check-api-btn" className="btn" onClick={checkApiHealth} disabled={loading}>
            {loading ? "Checking API Status..." : "Probe Backend Health (/health)"}
          </button>

          {health && (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                borderRadius: "8px",
                background: health.status === "ok" ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                border: `1px solid ${health.status === "ok" ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                display: "inline-block",
                textAlign: "left",
              }}
            >
              <div><strong>API Status:</strong> {health.status.toUpperCase()}</div>
              {health.timestamp && <div><strong>Timestamp:</strong> {health.timestamp}</div>}
              {health.error && <div style={{ color: "#f87171" }}><strong>Error:</strong> {health.error}</div>}
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                borderRadius: "8px",
                background: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "#f87171",
                display: "inline-block",
              }}
            >
              <strong>Connection Error:</strong> {errorMsg} (Is the API server running on port 4000?)
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
