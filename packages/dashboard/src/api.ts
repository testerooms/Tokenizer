const BASE_URL = import.meta.env.VITE_PROXY_API_URL || "http://localhost:3001";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export interface SpendSummary {
  engineerId: string; engineerName: string; team: string; tier: string;
  currentMonthCostUSD: number; softLimitUSD: number; hardLimitUSD: number;
  utilizationPct: number; status: string; totalRequests: number;
  avgCostPerRequest: number; topModel: string;
}

export interface Overview {
  totalSpentUSD: number; totalEngineers: number; activeEngineers: number;
  blockedEngineers: number; warningEngineers: number; teamCount: number;
  trend: { date: string; totalCost: number }[];
  topSpenders: SpendSummary[];
}

export interface TeamSummary {
  teamId: string; monthlyCapUSD: number; spentUSD: number;
  remainingUSD: number; utilizationPct: number;
  engineerCount: number; activeEngineers: number; status: string;
}

export interface Alert {
  id: string; engineerId?: string; teamId?: string;
  type: string; severity: string; message: string;
  timestamp: string; resolved: boolean;
}

export const api = {
  getOverview: () => fetchJSON<Overview>("/api/metrics/overview"),
  getEngineers: () => fetchJSON<SpendSummary[]>("/api/metrics/engineers"),
  getTeams: () => fetchJSON<TeamSummary[]>("/api/metrics/teams"),
  getTrend: (days = 30) => fetchJSON<{ date: string; totalCost: number }[]>(`/api/metrics/trend?days=${days}`),
  getAlerts: (resolved?: boolean) => fetchJSON<Alert[]>(`/api/alerts${resolved ? "?resolved=true" : ""}`),
};
