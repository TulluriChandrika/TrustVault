import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface HealthResponse {
  status: string;
  timestamp?: string;
  error?: string;
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  // Profile fetched from Express backend /api/me
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Health check
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.user && !data.session) {
          setAuthMessage({
            type: "info",
            text: "Sign-up successful! Please check your email to confirm your account before signing in.",
          });
        } else {
          setAuthMessage({
            type: "success",
            text: "Account registered and logged in successfully!",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        setAuthMessage(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setAuthMessage({ type: "error", text: msg });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
    setAuthLoading(false);
  };

  const fetchProfileFromBackend = async () => {
    if (!session?.access_token) return;
    setProfileLoading(true);
    setProfileError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Failed to fetch profile`);
      }

      setProfile(data.user);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Error querying backend");
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const checkApiHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      const data = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      setHealth({
        status: "offline",
        error: err instanceof Error ? err.message : "Failed to connect to API",
      });
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div>
      <header className="header">
        <div className="logo-badge">
          <div className="logo-icon">T</div>
          <span className="logo-title">TrustVault</span>
        </div>
        <div className="badge-phase">Phase 4 — Supabase Auth Ready</div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Secure Document Sharing with a Real Audit Trail</h1>
          <p>
            Cryptographically verified Supabase Auth with idempotent backend user provisioning and tamper-evident audit logging.
          </p>
        </section>

        {!isSupabaseConfigured && (
          <div className="alert-banner info" style={{ maxWidth: "680px", margin: "0 auto 2rem" }}>
            <strong>Configuration Notice:</strong> Frontend Supabase environment variables (
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>) are not yet set. For full browser login, configure these in your frontend environment.
          </div>
        )}

        {session ? (
          <div className="user-panel">
            <div className="user-header">
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Authenticated Session</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                  Connected as: <span style={{ color: "#fff", fontWeight: 600 }}>{session.user.email}</span>
                </p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontFamily: "monospace" }}>
                  Auth UUID: {session.user.id}
                </p>
              </div>
              <button id="sign-out-btn" className="btn btn-secondary" onClick={handleSignOut} disabled={authLoading}>
                Sign Out
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
              <button
                id="fetch-profile-btn"
                className="btn"
                onClick={fetchProfileFromBackend}
                disabled={profileLoading}
              >
                {profileLoading ? "Verifying..." : "Validate Token & Query /api/me"}
              </button>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Tests Express Bearer JWT validation & idempotent provisioning
              </span>
            </div>

            {profileError && (
              <div className="alert-banner error">
                <strong>Backend Verification Failed:</strong> {profileError}
              </div>
            )}

            {profile && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <span className="user-role-badge">Role: {profile.role}</span>
                  <span
                    className="user-role-badge"
                    style={{
                      background: profile.is_active ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                      color: profile.is_active ? "var(--accent-emerald)" : "var(--accent-rose)",
                      borderColor: profile.is_active ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)",
                    }}
                  >
                    {profile.is_active ? "Active Account" : "Inactive Account"}
                  </span>
                </div>
                <div className="json-view">
                  <pre>{JSON.stringify(profile, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="auth-box">
            <div className="auth-tabs">
              <button
                id="tab-signin"
                className={`auth-tab ${authMode === "signin" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("signin");
                  setAuthMessage(null);
                }}
              >
                Sign In
              </button>
              <button
                id="tab-signup"
                className={`auth-tab ${authMode === "signup" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMessage(null);
                }}
              >
                Create Account
              </button>
            </div>

            {authMessage && (
              <div className={`alert-banner ${authMessage.type}`}>{authMessage.text}</div>
            )}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label htmlFor="auth-email">Email Address</label>
                <input
                  id="auth-email"
                  type="email"
                  className="form-input"
                  required
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  className="form-input"
                  required
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                id="auth-submit-btn"
                type="submit"
                className="btn"
                style={{ width: "100%", marginTop: "0.5rem" }}
                disabled={authLoading}
              >
                {authLoading ? "Processing..." : authMode === "signin" ? "Sign In" : "Register Account"}
              </button>
            </form>
          </div>
        )}

        <div style={{ marginTop: "3rem", textAlign: "center" }}>
          <button id="check-api-btn" className="btn btn-secondary" onClick={checkApiHealth} disabled={healthLoading}>
            {healthLoading ? "Checking..." : "Backend Health Check (/health)"}
          </button>

          {health && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                background: health.status === "ok" ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                border: `1px solid ${health.status === "ok" ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                display: "inline-block",
                fontSize: "0.85rem",
              }}
            >
              <strong>Status:</strong> {health.status.toUpperCase()} | <strong>Time:</strong> {health.timestamp || "N/A"}
              {health.error && <span style={{ color: "#f87171", marginLeft: "0.5rem" }}>({health.error})</span>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
