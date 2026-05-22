import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, Shield, DollarSign, Users, Ban, CheckCircle, Clock, Activity, WifiOff, BookOpen, Copy, Terminal,
} from "lucide-react";
import { supabase } from "./supabase";
import { api, type Overview, type SpendSummary } from "./api";
import type { UserProfile } from "./auth";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e", warning: "#f59e0b", critical: "#ef4444", blocked: "#7c3aed",
};

const STATUS_BG: Record<string, string> = {
  ok: "rgba(34,197,94,0.12)", warning: "rgba(245,158,11,0.12)",
  critical: "rgba(239,68,68,0.12)", blocked: "rgba(124,58,237,0.12)",
};

function StatusBadge({ status }: { status: string }) {
  const Icon = status === "blocked" ? Ban : status === "critical" ? AlertTriangle : status === "warning" ? Clock : CheckCircle;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px",
      borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
      background: STATUS_BG[status] ?? STATUS_BG.ok,
      color: STATUS_COLOR[status] ?? STATUS_COLOR.ok,
      border: `1px solid ${STATUS_COLOR[status] ?? STATUS_COLOR.ok}40`,
      textTransform: "uppercase",
    }}>
      <Icon size={10} />{status}
    </span>
  );
}

function SpendBar({ pct, status }: { pct: number; status: string }) {
  const clamped = Math.min(pct, 100);
  return (
    <div style={{ background: "#1e2332", borderRadius: 4, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${clamped}%`,
        background: STATUS_COLOR[status] ?? STATUS_COLOR.ok,
        borderRadius: 4, transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        boxShadow: `0 0 8px ${STATUS_COLOR[status]}60`,
      }} />
    </div>
  );
}

export default function Dashboard({ profile }: { profile: UserProfile }) {
  type Tab = "overview" | "engineers" | "setup";
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [engineers, setEngineers] = useState<SpendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proxyStatus, setProxyStatus] = useState<"checking" | "online" | "offline">("checking");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, eng] = await Promise.all([
        api.getOverview(),
        api.getEngineers(),
      ]);
      setOverview(ov);
      setEngineers(eng);
      setProxyStatus("online");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
      setProxyStatus("offline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b0e1a",
      color: "#e2e8f0",
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1e2332",
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(11,14,26,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              Claude Cost Guardian
            </div>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.08em" }}>
              AI SPEND GOVERNANCE
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 12px",
            borderRadius: 6, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
            fontSize: 10, color: "#818cf8", fontWeight: 600, letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}>
            {profile.email}
            <span style={{ color: profile.role === "admin" ? "#22c55e" : "#f59e0b", marginLeft: 4 }}>
              ({profile.role})
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 12px",
            borderRadius: 6, background: "#0f1628", border: "1px solid #1e2332",
            fontSize: 11, color: proxyStatus === "online" ? "#22c55e" : proxyStatus === "offline" ? "#ef4444" : "#64748b",
          }}>
            {proxyStatus === "online" ? <Activity size={10} color="#22c55e" /> : <WifiOff size={10} color={proxyStatus === "offline" ? "#ef4444" : "#64748b"} />}
            {proxyStatus === "online" ? "PROXY ACTIVE" : proxyStatus === "offline" ? "PROXY OFFLINE" : "CHECKING..."}
          </div>
          <button onClick={handleLogout} style={{
            background: "transparent",
            border: "1px solid #1e2332", borderRadius: 6,
            padding: "6px 14px",
            fontSize: 11, color: "#64748b", cursor: "pointer",
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ padding: "0 32px", borderBottom: "1px solid #1e2332", display: "flex", gap: 0 }}>
        {(["overview", ...(profile.role === "admin" ? (["engineers"] as Tab[]) : []), "setup"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", padding: "14px 20px",
            fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            color: tab === t ? "#6366f1" : "#64748b",
            borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
            cursor: "pointer", transition: "color 0.2s", textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {t === "setup" && <BookOpen size={12} />}
            {t}
          </button>
        ))}
      </div>

      <main style={{ padding: "32px" }}>
        {tab === "setup" && <SetupTab />}
        {tab !== "setup" && loading && !overview && (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b", fontSize: 13 }}>
            <Activity size={24} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            Loading dashboard data...
          </div>
        )}
        {tab !== "setup" && error && !loading && (
          <div style={{
            textAlign: "center", padding: "80px 20px", color: "#ef4444", fontSize: 13,
            background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12,
          }}>
            <WifiOff size={24} style={{ margin: "0 auto 12px", opacity: 0.6 }} />
            <div style={{ marginBottom: 16, color: "#94a3b8" }}>Cannot connect to proxy server</div>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 16 }}>{error}</div>
            <button onClick={fetchData} style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none", borderRadius: 8, color: "white", padding: "10px 24px",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              Retry
            </button>
          </div>
        )}
        {overview && tab === "overview" && <OverviewTab overview={overview} />}
        {profile.role === "admin" && engineers.length > 0 && tab === "engineers" && <EngineersTab engineers={engineers} />}
      </main>
    </div>
  );
}

function OverviewTab({ overview }: { overview: Overview }) {
  const stats = [
    { label: "Total Spent (MTD)", value: `$${overview.totalSpentUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "#6366f1", sub: "this month" },
    { label: "Active Engineers", value: `${overview.activeEngineers}/${overview.totalEngineers}`, icon: Users, color: "#22c55e", sub: "using AI tools" },
    { label: "Over Budget", value: overview.blockedEngineers, icon: Ban, color: "#7c3aed", sub: "engineers blocked" },
    { label: "Near Limit", value: overview.warningEngineers, icon: AlertTriangle, color: "#f59e0b", sub: "engineers warned" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12,
            padding: "20px", display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>{s.label}</span>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: `${s.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <s.icon size={14} color={s.color} />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#475569" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Spend trend chart */}
      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, padding: "24px" }}>
        <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
          Daily Spend Trend (Last 30 Days)
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={overview.trend}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2332" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`$${v.toFixed(2)}`, "Spend"]}
            />
            <Area type="monotone" dataKey="totalCost" stroke="#6366f1" fill="url(#spendGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top spenders */}
      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, padding: "24px" }}>
        <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
          Top Spenders This Month
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {overview.topSpenders.map((eng) => (
            <div key={eng.engineerId} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>{eng.engineerName}</span>
                  <span style={{ fontSize: 10, color: "#475569", background: "#1e2332", padding: "1px 6px", borderRadius: 4 }}>{eng.team}</span>
                  <StatusBadge status={eng.status} />
                </div>
                <SpendBar pct={Math.min((eng.currentMonthCostUSD / eng.hardLimitUSD) * 100, 100)} status={eng.status} />
              </div>
              <div style={{ fontSize: 13, color: "#f8fafc", fontWeight: 700, textAlign: "right", minWidth: 80 }}>
                ${eng.currentMonthCostUSD.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "#64748b", textAlign: "right", minWidth: 60 }}>
                / ${eng.hardLimitUSD}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const codeStyle = {
  background: "#0d1120", border: "1px solid #1e2332", borderRadius: 8,
  padding: "16px 20px", fontSize: 12, color: "#e2e8f0", lineHeight: 1.8,
  overflowX: "auto" as const, fontFamily: "'IBM Plex Mono', monospace", margin: 0,
};

const commentStyle = { color: "#64748b", fontStyle: "italic" as const };

function SetupTab() {
  const [copied, setCopied] = useState("");

  const proxyUrl = import.meta.env.VITE_PROXY_API_URL || "http://localhost:3001";

  const configs = {
    opencode: `# Add to your opencode config (~/.opencode/config.json or project's opencode.json)
{
  "anthropicBaseUrl": "${proxyUrl}/proxy",
  "headers": {
    "x-engineer-id": "your-name"
  }
}`,
    claudeCode: `# Set these environment variables before running Claude Code:
export ANTHROPIC_BASE_URL="${proxyUrl}/proxy"
export X_ENGINEER_ID="your-name"

# Or pass them inline:
ANTHROPIC_BASE_URL="${proxyUrl}/proxy" \\
X_ENGINEER_ID="your-name" \\
claude`,
    curl: `curl ${proxyUrl}/api/metrics/overview`,
  };

  async function handleCopy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 800 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Connecting to the Proxy
        </div>
        <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7, margin: 0 }}>
          Point your AI coding tools at the Cost Guardian proxy instead of directly at the Anthropic API.
          The proxy authenticates each engineer, enforces budget policy, and records every token spent.
        </p>
      </div>

      {/* opencode */}
      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Terminal size={16} color="#6366f1" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.01em" }}>opencode</span>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>
          Add the proxy base URL and your engineer ID to your opencode config. The{" "}
          <code style={{ color: "#6366f1", background: "#0b0e1a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
            x-engineer-id
          </code>{" "}
          header is how the proxy identifies you for budget enforcement.
        </p>
        <div style={{ position: "relative" }}>
          <pre style={codeStyle}>
            <span style={commentStyle}>{"// ~/.opencode/config.json or project's opencode.json"}</span>{"\n"}
            {JSON.stringify({ anthropicBaseUrl: `${proxyUrl}/proxy`, headers: { "x-engineer-id": "your-name" } }, null, 2)}
          </pre>
          <button
            onClick={() => handleCopy("opencode", configs.opencode)}
            style={{
              position: "absolute", top: 8, right: 8,
              background: copied === "opencode" ? "rgba(99,102,241,0.2)" : "#0b0e1a",
              border: "1px solid #1e2332", borderRadius: 6,
              padding: "4px 10px", color: copied === "opencode" ? "#6366f1" : "#64748b",
              cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Copy size={10} /> {copied === "opencode" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Claude Code */}
      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Terminal size={16} color="#f59e0b" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.01em" }}>Claude Code</span>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>
          Set two environment variables before running Claude Code. The{" "}
          <code style={{ color: "#f59e0b", background: "#0b0e1a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
            ANTHROPIC_BASE_URL
          </code>{" "}
          routes all requests through the proxy, and{" "}
          <code style={{ color: "#f59e0b", background: "#0b0e1a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
            X_ENGINEER_ID
          </code>{" "}
          identifies you.
        </p>
        <div style={{ position: "relative" }}>
          <pre style={codeStyle}>
            <span style={commentStyle}>{"# Set env vars then run Claude Code"}</span>{"\n"}
            <span style={{ color: "#22c55e" }}>export</span>{" "}
            <span style={{ color: "#f59e0b" }}>ANTHROPIC_BASE_URL</span>=
            <span style={{ color: "#e2e8f0" }}>"{proxyUrl}/proxy"</span>{"\n"}
            <span style={{ color: "#22c55e" }}>export</span>{" "}
            <span style={{ color: "#f59e0b" }}>X_ENGINEER_ID</span>=
            <span style={{ color: "#e2e8f0" }}>"your-name"</span>{"\n"}
            <span>{"\n"}</span>
            <span style={{ color: "#64748b" }}>claude</span>
          </pre>
          <button
            onClick={() => handleCopy("claude", configs.claudeCode)}
            style={{
              position: "absolute", top: 8, right: 8,
              background: copied === "claude" ? "rgba(99,102,241,0.2)" : "#0b0e1a",
              border: "1px solid #1e2332", borderRadius: 6,
              padding: "4px 10px", color: copied === "claude" ? "#6366f1" : "#64748b",
              cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Copy size={10} /> {copied === "claude" ? "Copied" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#475569", margin: "12px 0 0", lineHeight: 1.6 }}>
          Alternatively, pass them inline:{" "}
          <code style={{ background: "#0b0e1a", padding: "2px 8px", borderRadius: 4, fontSize: 11, color: "#94a3b8" }}>
            ANTHROPIC_BASE_URL="{proxyUrl}/proxy" X_ENGINEER_ID="your-name" claude
          </code>
        </p>
      </div>

      {/* Verify */}
      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Activity size={16} color="#22c55e" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.01em" }}>Verify the Connection</span>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>
          Test that the proxy is reachable and returning data:
        </p>
        <div style={{ position: "relative" }}>
          <pre style={codeStyle}>
            <span style={commentStyle}>{"# Check proxy health"}</span>{"\n"}
            <span style={{ color: "#22c55e" }}>curl</span>{" "}
            <span style={{ color: "#6366f1" }}>{proxyUrl}</span>
            <span style={{ color: "#e2e8f0" }}>/health</span>{"\n"}
            {"\n"}
            <span style={commentStyle}>{"# View live metrics"}</span>{"\n"}
            <span style={{ color: "#22c55e" }}>curl</span>{" "}
            <span style={{ color: "#6366f1" }}>{proxyUrl}</span>
            <span style={{ color: "#e2e8f0" }}>/api/metrics/overview</span>
          </pre>
          <button
            onClick={() => handleCopy("curl", configs.curl)}
            style={{
              position: "absolute", top: 8, right: 8,
              background: copied === "curl" ? "rgba(99,102,241,0.2)" : "#0b0e1a",
              border: "1px solid #1e2332", borderRadius: 6,
              padding: "4px 10px", color: copied === "curl" ? "#6366f1" : "#64748b",
              cursor: "pointer", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Copy size={10} /> {copied === "curl" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Proxy URL badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 20px", borderRadius: 8,
        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
      }}>
        <Shield size={14} color="#6366f1" />
        <div>
          <div style={{ fontSize: 11, color: "#818cf8", fontWeight: 600 }}>Proxy Endpoint</div>
          <div style={{ fontSize: 12, color: "#c7d2fe", fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
            {proxyUrl}
          </div>
        </div>
      </div>
    </div>
  );
}

function EngineersTab({ engineers }: { engineers: SpendSummary[] }) {
  const [sort, setSort] = useState<"cost" | "util">("cost");
  const sorted = [...engineers].sort((a, b) =>
    sort === "cost" ? b.currentMonthCostUSD - a.currentMonthCostUSD : b.utilizationPct - a.utilizationPct
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {engineers.length} Engineers
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["cost", "util"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} style={{
              background: sort === s ? "#1e2332" : "none",
              border: "1px solid #1e2332", borderRadius: 6, padding: "5px 12px",
              fontSize: 11, color: sort === s ? "#6366f1" : "#64748b", cursor: "pointer",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Sort by {s === "cost" ? "Spend" : "Utilization"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#0f1628", border: "1px solid #1e2332", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 1fr",
          padding: "12px 20px", borderBottom: "1px solid #1e2332",
          fontSize: 10, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          <span>Engineer</span><span>Team</span><span>Tier</span>
          <span>Spend / Limit</span><span>Requests</span><span>Status</span>
        </div>

        {sorted.map((eng, i) => (
          <div key={eng.engineerId} style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 1fr",
            padding: "14px 20px",
            borderBottom: i < sorted.length - 1 ? "1px solid #1e2332" : "none",
            alignItems: "center",
            transition: "background 0.15s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#0d1120")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>{eng.engineerName}</div>
              <SpendBar pct={Math.min((eng.currentMonthCostUSD / eng.hardLimitUSD) * 100, 100)} status={eng.status} />
            </div>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{eng.team}</span>
            <span style={{
              fontSize: 10, color: eng.tier === "power" ? "#6366f1" : eng.tier === "restricted" ? "#ef4444" : "#64748b",
              textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            }}>{eng.tier}</span>
            <span style={{ fontSize: 12 }}>
              <span style={{ color: STATUS_COLOR[eng.status], fontWeight: 700 }}>${eng.currentMonthCostUSD.toFixed(0)}</span>
              <span style={{ color: "#475569" }}> / ${eng.hardLimitUSD}</span>
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>{eng.totalRequests.toLocaleString()}</span>
            <StatusBadge status={eng.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
