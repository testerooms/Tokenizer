import { db } from "./db";
import { logger } from "./logger";

interface BudgetCheckResult {
  blocked: boolean;
  warning: boolean;
  reason?: string;
  currentSpend?: number;
  limit?: number;
  utilization?: number;
  resetDate?: string;
}

class PolicyEngine {
  async checkBudget(engineerId: string): Promise<BudgetCheckResult> {
    try {
      const currentSpend = db.getEngineerSpendThisMonth(engineerId);

      // Get engineer's team and policy
      const engineer = (db as any).db
        ?.prepare("SELECT * FROM engineers WHERE id = ?")
        .get(engineerId) as any;

      const teamId = engineer?.team_id ?? "default";
      const policy = db.getPolicy(teamId) ?? {
        per_engineer_soft_limit_usd: 150,
        per_engineer_hard_limit_usd: 500,
        monthly_cap_usd: 5000,
      };

      const hardLimit = policy.per_engineer_hard_limit_usd;
      const softLimit = policy.per_engineer_soft_limit_usd;
      const utilization = currentSpend / hardLimit;

      // Next month reset date
      const now = new Date();
      const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      // Hard limit — block the request
      if (currentSpend >= hardLimit) {
        return {
          blocked: true,
          warning: false,
          reason: `Monthly hard limit of $${hardLimit.toFixed(2)} reached. Spent: $${currentSpend.toFixed(2)}. Resets ${resetDate.slice(0, 10)}.`,
          currentSpend,
          limit: hardLimit,
          utilization: utilization * 100,
          resetDate,
        };
      }

      // Soft limit — warn but allow
      if (currentSpend >= softLimit) {
        return {
          blocked: false,
          warning: true,
          reason: `Soft limit of $${softLimit.toFixed(2)} exceeded. Current spend: $${currentSpend.toFixed(2)} / $${hardLimit.toFixed(2)} hard limit.`,
          currentSpend,
          limit: hardLimit,
          utilization: utilization * 100,
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

      return { blocked: false, warning: false, utilization: utilization * 100 };
    } catch (err) {
      logger.error("Policy check failed, allowing request", err);
      return { blocked: false, warning: false };
    }
  }
}

export const policyEngine = new PolicyEngine();
