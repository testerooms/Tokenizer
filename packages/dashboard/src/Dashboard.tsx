import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, Shield, DollarSign, Users, Ban, CheckCircle, Clock, Activity, WifiOff,
} from "lucide-react";
import { supabase } from "./supabase";
import { api, type Overview, type SpendSummary } from "./api";

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

export default function Dashboard() {
  const [tab, setTab] = useState<"overview" | "engineers">("overview");
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
        {(["overview", "engineers"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", padding: "14px 20px",
            fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            color: tab === t ? "#6366f1" : "#64748b",
            borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
            cursor: "pointer", transition: "color 0.2s", textTransform: "uppercase",
          }}>
            {t}
          </button>
        ))}
      </div>

      <main style={{ padding: "32px" }}>
        {loading && !overview && (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b", fontSize: 13 }}>
            <Activity size={24} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            Loading dashboard data...
          </div>
        )}
        {error && !loading && (
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
        {engineers.length > 0 && tab === "engineers" && <EngineersTab engineers={engineers} />}
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
