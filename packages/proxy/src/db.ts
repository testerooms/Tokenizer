import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { calculateCost, SpendSummary, TeamSummary, TokenUsageRecord, Alert } from "@claude-cost-guardian/shared";
import { logger } from "./logger";
import { v4 as uuidv4 } from "uuid";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "guardian.db");

class GuardianDB {
  private db!: Database.Database;

  initialize() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.seed();
    logger.info(`Database initialized at ${DB_PATH}`);
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS engineers (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'standard',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS budget_policies (
        team_id TEXT PRIMARY KEY,
        monthly_cap_usd REAL NOT NULL,
        per_engineer_soft_limit_usd REAL NOT NULL,
        per_engineer_hard_limit_usd REAL NOT NULL,
        alert_thresholds TEXT NOT NULL DEFAULT '[0.5,0.8,0.95]'
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        engineer_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL,
        FOREIGN KEY (engineer_id) REFERENCES engineers(id)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        engineer_id TEXT,
        team_id TEXT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_usage_engineer ON usage_records(engineer_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_team ON usage_records(team_id, timestamp);
    `);
  }

  async recordUsage(params: {
    engineerId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }) {
    const engineer = this.db
      .prepare("SELECT * FROM engineers WHERE id = ?")
      .get(params.engineerId) as any;

    const cost = calculateCost(
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.cacheReadTokens,
      params.cacheWriteTokens
    );

    const record: TokenUsageRecord = {
      id: uuidv4(),
      engineerId: params.engineerId,
      teamId: engineer?.team_id ?? "default",
      timestamp: new Date().toISOString(),
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cacheReadTokens: params.cacheReadTokens,
      cacheWriteTokens: params.cacheWriteTokens,
      costUSD: cost,
      requestType: "completion",
    };

    this.db.prepare(`
      INSERT INTO usage_records (id, engineer_id, team_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.engineerId, record.teamId, record.timestamp,
      record.model, record.inputTokens, record.outputTokens,
      record.cacheReadTokens, record.cacheWriteTokens, record.costUSD
    );

    return record;
  }

  engineerExists(engineerId: string): boolean {
    const result = this.db.prepare("SELECT 1 FROM engineers WHERE id = ?").get(engineerId);
    return !!result;
  }

  getEngineerSpendThisMonth(engineerId: string): number {
    const result = this.db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM usage_records
      WHERE engineer_id = ?
        AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `).get(engineerId) as any;
    return result?.total ?? 0;
  }

  getPolicy(teamId: string) {
    return this.db.prepare("SELECT * FROM budget_policies WHERE team_id = ?").get(teamId) as any;
  }

  getAllSpendSummaries(): SpendSummary[] {
    const engineers = this.db.prepare("SELECT * FROM engineers").all() as any[];
    return engineers.map((eng) => {
      const policy = this.getPolicy(eng.team_id) ?? {
        per_engineer_soft_limit_usd: 150,
        per_engineer_hard_limit_usd: 500,
      };
      const spend = this.getEngineerSpendThisMonth(eng.id);
      const utilization = (spend / policy.per_engineer_hard_limit_usd) * 100;
      const topModelRow = this.db.prepare(`
        SELECT model, COUNT(*) as cnt FROM usage_records WHERE engineer_id = ? GROUP BY model ORDER BY cnt DESC LIMIT 1
      `).get(eng.id) as any;

      return {
        engineerId: eng.id,
        engineerName: eng.name,
        team: eng.team_id,
        tier: eng.tier,
        currentMonthCostUSD: spend,
        softLimitUSD: policy.per_engineer_soft_limit_usd,
        hardLimitUSD: policy.per_engineer_hard_limit_usd,
        utilizationPct: utilization,
        status: spend >= policy.per_engineer_hard_limit_usd
          ? "blocked"
          : spend >= policy.per_engineer_soft_limit_usd * 0.95
          ? "critical"
          : spend >= policy.per_engineer_soft_limit_usd * 0.8
          ? "warning"
          : "ok",
        totalRequests: (this.db.prepare(`SELECT COUNT(*) as c FROM usage_records WHERE engineer_id = ?`).get(eng.id) as any)?.c ?? 0,
        avgCostPerRequest: spend / Math.max(1, (this.db.prepare(`SELECT COUNT(*) as c FROM usage_records WHERE engineer_id = ?`).get(eng.id) as any)?.c ?? 1),
        topModel: topModelRow?.model ?? "unknown",
      } as SpendSummary;
    });
  }

  getTeamSummaries(): TeamSummary[] {
    const teams = this.db.prepare("SELECT DISTINCT team_id FROM engineers").all() as any[];
    return teams.map(({ team_id }) => {
      const policy = this.getPolicy(team_id) ?? { monthly_cap_usd: 5000 };
      const spentRow = this.db.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_records
        WHERE team_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
      `).get(team_id) as any;
      const spent = spentRow?.total ?? 0;
      const cap = policy.monthly_cap_usd;
      const engineerCount = (this.db.prepare("SELECT COUNT(*) as c FROM engineers WHERE team_id = ?").get(team_id) as any)?.c ?? 0;
      const activeEngineers = (this.db.prepare(`
        SELECT COUNT(DISTINCT engineer_id) as c FROM usage_records
        WHERE team_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
      `).get(team_id) as any)?.c ?? 0;

      return {
        teamId: team_id,
        monthlyCapUSD: cap,
        spentUSD: spent,
        remainingUSD: Math.max(0, cap - spent),
        utilizationPct: (spent / cap) * 100,
        engineerCount,
        activeEngineers,
        status: spent >= cap ? "exhausted" : spent >= cap * 0.95 ? "critical" : spent >= cap * 0.8 ? "warning" : "ok",
      } as TeamSummary;
    });
  }

  getAlerts(resolved = false): Alert[] {
    return this.db.prepare("SELECT * FROM alerts WHERE resolved = ? ORDER BY timestamp DESC LIMIT 100")
      .all(resolved ? 1 : 0) as Alert[];
  }

  getDailySpendTrend(days = 30): { date: string; totalCost: number }[] {
    return this.db.prepare(`
      SELECT strftime('%Y-%m-%d', timestamp) as date, SUM(cost_usd) as totalCost
      FROM usage_records
      WHERE timestamp >= datetime('now', ? || ' days')
      GROUP BY date ORDER BY date
    `).all(`-${days}`) as any[];
  }

  private seed() {
    const count = (this.db.prepare("SELECT COUNT(*) as c FROM engineers").get() as any)?.c ?? 0;
    if (count > 0) return;

    logger.info("Seeding demo data...");

    const engineers = [
      { id: "alice", name: "Alice Chen", team: "platform", tier: "power" },
      { id: "bob", name: "Bob Martinez", team: "platform", tier: "standard" },
      { id: "charlie", name: "Charlie Park", team: "ml", tier: "power" },
      { id: "diana", name: "Diana Lopez", team: "ml", tier: "standard" },
      { id: "eve", name: "Eve Thompson", team: "ml", tier: "standard" },
      { id: "frank", name: "Frank Osei", team: "sales", tier: "restricted" },
    ];

    const insertEng = this.db.prepare(
      "INSERT OR IGNORE INTO engineers (id, email, name, team_id, tier) VALUES (?, ?, ?, ?, ?)"
    );
    for (const e of engineers) {
      insertEng.run(e.id, `${e.id}@company.com`, e.name, e.team, e.tier);
    }

    this.db.prepare(
      "INSERT OR IGNORE INTO budget_policies (team_id, monthly_cap_usd, per_engineer_soft_limit_usd, per_engineer_hard_limit_usd) VALUES (?, ?, ?, ?)"
    ).run("platform", 5000, 150, 500);
    this.db.prepare(
      "INSERT OR IGNORE INTO budget_policies (team_id, monthly_cap_usd, per_engineer_soft_limit_usd, per_engineer_hard_limit_usd) VALUES (?, ?, ?, ?)"
    ).run("ml", 8000, 200, 600);
    this.db.prepare(
      "INSERT OR IGNORE INTO budget_policies (team_id, monthly_cap_usd, per_engineer_soft_limit_usd, per_engineer_hard_limit_usd) VALUES (?, ?, ?, ?)"
    ).run("sales", 2000, 50, 150);

    const models = ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"];
    const insertUsage = this.db.prepare(
      "INSERT INTO usage_records (id, engineer_id, team_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const now = Date.now();
    for (let day = 30; day >= 0; day--) {
      for (const eng of engineers) {
        const requests = Math.floor(Math.random() * 8) + 1;
        for (let r = 0; r < requests; r++) {
          const model = models[Math.floor(Math.random() * models.length)];
          const inputTokens = Math.floor(Math.random() * 4000) + 500;
          const outputTokens = Math.floor(Math.random() * 1500) + 100;
          const cacheRead = Math.floor(Math.random() * 2000);
          const cacheWrite = Math.floor(Math.random() * 500);
          const cost = calculateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite);
          const ts = new Date(now - day * 86400000 + r * 60000).toISOString();
          insertUsage.run(uuidv4(), eng.id, eng.team, ts, model, inputTokens, outputTokens, cacheRead, cacheWrite, cost);
        }
      }
    }

    logger.info(`Seeded demo data for ${engineers.length} engineers across 31 days`);
  }
}

export const db = new GuardianDB();
