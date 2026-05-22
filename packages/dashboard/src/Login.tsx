import { useState, FormEvent } from "react";
import { supabase } from "./supabase";

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#0b0e1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'IBM Plex Mono', monospace",
    padding: "20px",
  },
  box: {
    background: "#0f1628",
    border: "1px solid #1e2332",
    borderRadius: 12,
    padding: "40px",
    width: "100%",
    maxWidth: 400,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 8,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const,
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: "#f8fafc",
    letterSpacing: "-0.02em",
    textAlign: "center" as const,
  },
  subtitle: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center" as const,
    letterSpacing: "0.08em",
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 10,
    color: "#64748b",
    letterSpacing: "0.08em",
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  input: {
    width: "100%",
    background: "#0b0e1a",
    border: "1px solid #1e2332",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "10px 14px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  btn: {
    width: "100%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    border: "none",
    borderRadius: 8,
    color: "white",
    padding: "12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  error: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center" as const,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "24px 0",
    color: "#475569",
    fontSize: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#1e2332",
  },
  magicBtn: {
    width: "100%",
    background: "transparent",
    border: "1px solid #1e2332",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "10px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    cursor: "pointer",
  },
  toggle: {
    background: "none",
    border: "none",
    color: "#6366f1",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    cursor: "pointer",
    marginTop: 16,
    display: "block",
    width: "100%",
    textAlign: "center" as const,
  },
};

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const authFn = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { error: err } = await authFn;

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    if (mode === "signup") {
      setError("Check your email to confirm signup.");
      return;
    }

    onAuth();
  }

  async function handleGitHubLogin() {
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div style={styles.title}>Tokenizer</div>
        </div>
        <div style={styles.subtitle}>AI SPEND GOVERNANCE</div>

        <form onSubmit={handleSubmit}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
            disabled={loading}
            type="submit"
          >
            {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span>OR</span>
          <div style={styles.dividerLine} />
        </div>

        <button
          style={styles.magicBtn}
          onClick={handleGitHubLogin}
          disabled={loading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle", marginRight: 8 }}>
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>

        <button
          style={styles.toggle}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin"
            ? "No account? Create one"
            : "Already have an account? Sign in"}
        </button>

        <a href="/" style={{
          display: "block", textAlign: "center" as const, marginTop: 20,
          color: "#475569", fontSize: 11, textDecoration: "none",
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
