// Shared types across proxy and dashboard

export interface Engineer {
  id: string;
  email: string;
  name: string;
  team: string;
  tier: "standard" | "power" | "restricted";
}

export interface BudgetPolicy {
  teamId: string;
  monthlyCapUSD: number;
  perEngineerSoftLimitUSD: number;
  perEngineerHardLimitUSD: number;
  alertThresholds: number[]; // e.g. [0.5, 0.8, 0.95]
}

export interface TokenUsageRecord {
  id: string;
  engineerId: string;
  teamId: string;
  timestamp: string; // ISO
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUSD: number;
  requestType: "completion" | "tool_use" | "agent";
}

export interface SpendSummary {
  engineerId: string;
  engineerName: string;
  team: string;
  tier: Engineer["tier"];
  currentMonthCostUSD: number;
  softLimitUSD: number;
  hardLimitUSD: number;
  utilizationPct: number;
  status: "ok" | "warning" | "critical" | "blocked";
  totalRequests: number;
  avgCostPerRequest: number;
  topModel: string;
}

export interface TeamSummary {
  teamId: string;
  monthlyCapUSD: number;
  spentUSD: number;
  remainingUSD: number;
  utilizationPct: number;
  engineerCount: number;
  activeEngineers: number;
  status: "ok" | "warning" | "critical" | "exhausted";
}

export interface Alert {
  id: string;
  engineerId?: string;
  teamId?: string;
  type: "soft_limit" | "hard_limit" | "team_budget" | "anomaly";
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  resolved: boolean;
}

// Anthropic token pricing (per million tokens)
export const MODEL_PRICING: Record<string, {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheWritePer1M: number;
}> = {
  "claude-opus-4-5": {
    inputPer1M: 15,
    outputPer1M: 75,
    cacheReadPer1M: 1.5,
    cacheWritePer1M: 18.75,
  },
  "claude-sonnet-4-5": {
    inputPer1M: 3,
    outputPer1M: 15,
    cacheReadPer1M: 0.3,
    cacheWritePer1M: 3.75,
  },
  "claude-haiku-4-5": {
    inputPer1M: 0.8,
    outputPer1M: 4,
    cacheReadPer1M: 0.08,
    cacheWritePer1M: 1,
  },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-5"];
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M +
    (cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M
  );
}
