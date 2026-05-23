import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "./supabase";
import { getProfile, type UserProfile } from "./auth";
import Login from "./Login";
import Dashboard from "./Dashboard";

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    setTimeout(onDone, 2000);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0b0e1a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <div style={{
        background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12,
        padding: 40, width: 380,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em" }}>
              Set New Password
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.08em" }}>
              PASSWORD RESET
            </div>
          </div>
        </div>

        {success ? (
          <div style={{
            fontSize: 13, color: "#22c55e", textAlign: "center", marginTop: 24, lineHeight: 1.7,
          }}>
            Password updated! Redirecting...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
                New Password
              </label>
              <input
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "#0b0e1a", border: "1px solid #1e2332",
                  color: "#e2e8f0", fontSize: 13, outline: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  boxSizing: "border-box",
                }}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
                Confirm New Password
              </label>
              <input
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "#0b0e1a", border: "1px solid #1e2332",
                  color: "#e2e8f0", fontSize: 13, outline: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  boxSizing: "border-box",
                }}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 12 }}>{error}</div>}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "12px", borderRadius: 8, border: "none",
                background: loading ? "#1e2332" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: loading ? "#64748b" : "white", fontSize: 12, fontWeight: 700,
                cursor: loading ? "default" : "pointer", letterSpacing: "0.04em",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  async function fetchProfile() {
    setProfileLoading(true);
    const p = await getProfile();
    setProfile(p);
    setProfileLoading(false);
  }

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) {
      setRecoveryMode(true);
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(!!s);
      if (s) fetchProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(!!session);
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
      if (event === "SIGNED_IN" && session) {
        fetchProfile();
      }
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRecoveryMode(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (recoveryMode) {
    return <ResetPassword onDone={() => setRecoveryMode(false)} />;
  }

  if (session === null) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0b0e1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        color: "#64748b",
        fontSize: 13,
      }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Login onAuth={() => { setSession(true); fetchProfile(); }} />;
  }

  if (profileLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0b0e1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        color: "#64748b",
        fontSize: 13,
      }}>
        Loading profile...
      </div>
    );
  }

  return <Dashboard profile={profile!} />;
}
