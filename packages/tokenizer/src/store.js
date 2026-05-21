const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const DB_PATH = process.env.TOKENIZER_DB || path.join(os.homedir(), ".tokenizer", "usage.db");

class Store {
  constructor() { this.db = null; }

  init() {
    const dir = path.dirname(DB_PATH);
    require("fs").mkdirSync(dir, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id TEXT PRIMARY KEY,
        engineer_id TEXT NOT NULL DEFAULT 'default',
        model TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        cost_usd REAL NOT NULL,
        timestamp TEXT NOT NULL,
        request_type TEXT DEFAULT 'completion'
      );
      CREATE INDEX IF NOT EXISTS idx_usage_month ON usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_engineer ON usage(engineer_id);
    `);
  }

  record(params) {
    const stmt = this.db.prepare(`
      INSERT INTO usage (id, engineer_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, timestamp, request_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.id, params.engineerId, params.model,
      params.inputTokens, params.outputTokens,
      params.cacheReadTokens, params.cacheWriteTokens,
      params.costUSD, new Date().toISOString(),
      params.requestType || "completion"
    );
  }

  getSpendThisMonth(engineerId) {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage
      WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
      AND engineer_id = ?
    `).get(engineerId);
    return row.total;
  }

  getTotalSpendThisMonth() {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage
      WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `).get();
    return row.total;
  }

  getAllEngineerSummaries() {
    const engineers = this.db.prepare(`
      SELECT engineer_id,
             SUM(cost_usd) as total,
             COUNT(*) as requests,
             AVG(cost_usd) as avg_cost
      FROM usage
      WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
      GROUP BY engineer_id
      ORDER BY total DESC
    `).all();
    return engineers;
  }

  getRecentUsage(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM usage ORDER BY timestamp DESC LIMIT ?
    `).all(limit);
  }

  getDailyTrend(days = 30) {
    return this.db.prepare(`
      SELECT strftime('%Y-%m-%d', timestamp) as date, SUM(cost_usd) as total, SUM(input_tokens + output_tokens) as tokens
      FROM usage
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date ORDER BY date
    `).all(days);
  }

  close() { if (this.db) this.db.close(); }
}

module.exports = { Store, DB_PATH };
