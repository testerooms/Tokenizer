import { db } from "./db";
import { logger } from "./logger";

const TIER_MULTIPLIERS: Record<string, number> = {
  standard: 1.0,
  power: 3.0,
  restricted: 0.25,
};

const GLOBAL_EMERGENCY_STOP = process.env.GLOBAL_EMERGENCY_STOP === "true";

interface BudgetCheckResult {
  blocked: boolean;
  warning: boolean;
  reason?: string;
  currentSpend?: number;
  limit?: number;
  utilization?: number;
  resetDate?: string;
}

let lastAlertTime: Record<string, number> = {};

function shouldSuppressAlert(key: string): boolean {
  const now = Date.now();
  const last = lastAlertTime[key];
  if (last && now - last < 3600000) return true;
  lastAlertTime[key] = now;
  return false;
}

class PolicyEngine {
  async checkBudget(engineerId: string): Promise<BudgetCheckResult> {
    try {
      if (GLOBAL_EMERGENCY_STOP) {
        return {
          blocked: true,
          warning: false,
          reason: "All requests blocked by global emergency stop. Contact your admin.",
        };
      }

      const currentSpend = db.getEngineerSpendThisMonth(engineerId);
      const engineer = db.getEngineer(engineerId);
      const teamId = engineer?.team_id ?? "default";
      const policy = db.getPolicy(teamId) ?? {
        per_engineer_soft_limit_usd: 150,
        per_engineer_hard_limit_usd: 500,
        monthly_cap_usd: 5000,
      };

      const tier = engineer?.tier ?? "standard";
      const multiplier = TIER_MULTIPLIERS[tier] ?? 1.0;
      const hardLimit = policy.per_engineer_hard_limit_usd * multiplier;
      const softLimit = policy.per_engineer_soft_limit_usd * multiplier;

      // Next month reset date
      const now = new Date();
      const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      // Team budget check
      const teamSpend = db.getTeamSpendThisMonth(teamId);
      const teamCap = policy.monthly_cap_usd;

      if (teamSpend >= teamCap) {
        const key = `team:${teamId}`;
        if (!shouldSuppressAlert(key)) {
          db.createAlert({
            teamId,
            type: "team_budget",
            severity: "critical",
            message: `Team budget exhausted for ${teamId}: $${teamSpend.toFixed(2)} / $${teamCap.toFixed(2)}`,
          });
        }
        return {
          blocked: true,
          warning: false,
          reason: `Team monthly cap of $${teamCap.toFixed(2)} reached for ${teamId}. Contact your admin.`,
          currentSpend,
          limit: teamCap,
          utilization: (teamSpend / teamCap) * 100,
          resetDate,
        };
      }

      // Hard limit — block the request
      if (currentSpend >= hardLimit) {
        const key = `hard:${engineerId}`;
        if (!shouldSuppressAlert(key)) {
          db.createAlert({
            engineerId,
            teamId,
            type: "hard_limit",
            severity: "critical",
            message: `Engineer ${engineer?.name ?? engineerId} hit hard limit: $${currentSpend.toFixed(2)} / $${hardLimit.toFixed(2)}`,
          });
        }
        return {
          blocked: true,
          warning: false,
          reason: `Monthly hard limit of $${hardLimit.toFixed(2)} reached. Spent: $${currentSpend.toFixed(2)}. Resets ${resetDate.slice(0, 10)}.`,
          currentSpend,
          limit: hardLimit,
          utilization: (currentSpend / hardLimit) * 100,
          resetDate,
        };
      }

      // Soft limit — warn but allow
      if (currentSpend >= softLimit) {
        const key = `soft:${engineerId}`;
        if (!shouldSuppressAlert(key)) {
          db.createAlert({
            engineerId,
            teamId,
            type: "soft_limit",
            severity: "warning",
            message: `Engineer ${engineer?.name ?? engineerId} exceeded soft limit: $${currentSpend.toFixed(2)} / $${softLimit.toFixed(2)}`,
          });
        }
        return {
          blocked: false,
          warning: true,
          reason: `Soft limit of $${softLimit.toFixed(2)} exceeded. Current spend: $${currentSpend.toFixed(2)} / $${hardLimit.toFixed(2)} hard limit.`,
          currentSpend,
          limit: hardLimit,
          utilization: (currentSpend / hardLimit) * 100,
          resetDate,
        };
      }

      // 80% of soft limit — early warning
      if (currentSpend >= softLimit * 0.8) {
        return {
          blocked: false,
          warning: true,
          reason: `Approaching soft limit. Current spend: $${currentSpend.toFixed(2)} / $${softLimit.toFixed(2)}.`,
          currentSpend,
          limit: softLimit,
          utilization: (currentSpend / softLimit) * 100,
          resetDate,
        };
      }

      return { blocked: false, warning: false, utilization: (currentSpend / hardLimit) * 100 };
    } catch (err) {
      logger.error("Policy check failed, allowing request", err);
      return { blocked: false, warning: false };
    }
  }
}

export const policyEngine = new PolicyEngine();
