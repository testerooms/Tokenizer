const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");
const fs = require("fs");

const DB_DIR = path.join(os.homedir(), ".tokenizer");
const DB_PATH = path.join(DB_DIR, "usage.db");
const CONFIG_PATH = path.join(DB_DIR, "config.json");

class Store {
  constructor() { this.db = null; }

  init() {
    fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        monthly_budget_usd REAL NOT NULL DEFAULT 0,
        default_daily_budget_usd REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS engineers (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        team_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'engineer',
        tier TEXT NOT NULL DEFAULT 'standard',
        daily_budget_usd REAL NOT NULL DEFAULT 0,
        monthly_budget_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS usage (
        id TEXT PRIMARY KEY,
        engineer_id TEXT NOT NULL DEFAULT 'default',
        model TEXT NOT NULL DEFAULT '',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL DEFAULT '',
        request_type TEXT DEFAULT 'completion'
      );

      CREATE TABLE IF NOT EXISTS allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        engineer_email TEXT NOT NULL,
        engineer_id TEXT NOT NULL DEFAULT '',
        tokens_allocated INTEGER NOT NULL DEFAULT 0,
        budget_usd REAL NOT NULL DEFAULT 0,
        allocated_by TEXT NOT NULL DEFAULT 'admin',
        period TEXT NOT NULL DEFAULT 'daily',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS budgets (
        engineer_id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        tier TEXT NOT NULL DEFAULT 'standard',
        daily_budget_usd REAL NOT NULL DEFAULT 0,
        monthly_budget_usd REAL NOT NULL DEFAULT 0
      );
    `);
  }

  // ── Config ──

  getConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); }
    catch { return { notifications: { slack: { enabled: false, webhook_url: "" }, email: { enabled: false, smtp: "", from: "" } } }; }
  }

  setConfig(key, value) {
    const cfg = this.getConfig();
    const keys = key.split(".");
    let obj = cfg;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  }

  // ── Engineers (with roles) ──

  upsertEngineer(id, email, name, teamId, role, tier, dailyBudget, monthlyBudget) {
    this.db.prepare(`
      INSERT INTO engineers (id, email, name, team_id, role, tier, daily_budget_usd, monthly_budget_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email, name = excluded.name, team_id = excluded.team_id,
        role = excluded.role, tier = excluded.tier,
        daily_budget_usd = excluded.daily_budget_usd, monthly_budget_usd = excluded.monthly_budget_usd
    `).run(id, email, name, teamId, role, tier, dailyBudget, monthlyBudget);
    // Also sync to budgets table
    this.db.prepare(`
      INSERT INTO budgets (engineer_id, team_id, name, email, tier, daily_budget_usd, monthly_budget_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(engineer_id) DO UPDATE SET
        team_id = excluded.team_id, name = excluded.name, email = excluded.email,
        tier = excluded.tier, daily_budget_usd = excluded.daily_budget_usd, monthly_budget_usd = excluded.monthly_budget_usd
    `).run(id, teamId, name, email, tier, dailyBudget, monthlyBudget);
  }

  getEngineer(id) {
    return this.db.prepare(`SELECT * FROM engineers WHERE id = ?`).get(id) || null;
  }

  getEngineerByEmail(email) {
    return this.db.prepare(`SELECT * FROM engineers WHERE email = ?`).get(email) || null;
  }

  getAllEngineers() {
    return this.db.prepare(`SELECT * FROM engineers ORDER BY role, name`).all();
  }

  getEngineersByRole(role) {
    return this.db.prepare(`SELECT * FROM engineers WHERE role = ? ORDER BY name`).all(role);
  }

  // ── Allocations ──

  createAllocation(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, period, note) {
    const result = this.db.prepare(`
      INSERT INTO allocations (engineer_email, engineer_id, tokens_allocated, budget_usd, allocated_by, period, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, period, note);
    return result.lastInsertRowid;
  }

  getAllocations(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM allocations ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }

  getAllocationsByEmail(email) {
    return this.db.prepare(`
      SELECT * FROM allocations WHERE engineer_email = ? OR engineer_id = ? ORDER BY created_at DESC
    `).all(email, email);
  }

  // ── Teams ──

  upsertTeam(teamId, name, monthlyBudget, defaultDaily) {
    this.db.prepare(`
      INSERT INTO teams (team_id, name, monthly_budget_usd, default_daily_budget_usd)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        name = excluded.name, monthly_budget_usd = excluded.monthly_budget_usd,
        default_daily_budget_usd = excluded.default_daily_budget_usd
    `).run(teamId, name, monthlyBudget, defaultDaily);
  }

  getTeam(teamId) {
    return this.db.prepare(`SELECT * FROM teams WHERE team_id = ?`).get(teamId) || null;
  }

  getAllTeams() {
    return this.db.prepare(`SELECT * FROM teams ORDER BY name`).all();
  }

  getEngineersByTeam(teamId) {
    return this.db.prepare(`SELECT * FROM engineers WHERE team_id = ? ORDER BY name`).all(teamId);
  }

  // ── Budget resolution ──

  resolveBudget(engineerId) {
    const eng = this.db.prepare(`SELECT * FROM engineers WHERE id = ?`).get(engineerId);
    if (!eng) return { daily: 0, monthly: 0, source: "none" };

    if (eng.daily_budget_usd > 0 || eng.monthly_budget_usd > 0)
      return { daily: eng.daily_budget_usd, monthly: eng.monthly_budget_usd, source: "personal" };

    const team = eng.team_id ? this.getTeam(eng.team_id) : null;
    if (team?.default_daily_budget_usd > 0)
      return { daily: team.default_daily_budget_usd, monthly: team.monthly_budget_usd, source: "team" };

    return { daily: 0, monthly: 0, source: "none" };
  }

  setDailyBudget(engineerId, amountUsd) {
    this.db.prepare(`
      INSERT INTO engineers (id, email, name, team_id, role, tier, daily_budget_usd, monthly_budget_usd)
      VALUES (?, '', '', '', 'engineer', 'standard', ?, 0)
      ON CONFLICT(id) DO UPDATE SET daily_budget_usd = ?
    `).run(engineerId, amountUsd, amountUsd);
  }

  getBudget(engineerId) {
    const r = this.resolveBudget(engineerId);
    return { daily_budget_usd: r.daily, monthly_budget_usd: r.monthly, source: r.source };
  }

  // ── Spend ──

  getTodaySpend(engineerId) {
    const row = this.db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens FROM usage WHERE engineer_id = ? AND date(timestamp) = date('now')`).get(engineerId);
    return { cost: row.total, tokens: row.tokens };
  }

  getMonthSpend(engineerId) {
    const row = this.db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens FROM usage WHERE engineer_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')`).get(engineerId);
    return { cost: row.total, tokens: row.tokens };
  }

  getSpendByModel(engineerId) {
    return this.db.prepare(`SELECT model, SUM(cost_usd) as total, COUNT(*) as requests FROM usage WHERE engineer_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now') GROUP BY model ORDER BY total DESC`).all(engineerId);
  }

  getDailySpendToday() {
    return this.db.prepare(`SELECT engineer_id, COALESCE(SUM(cost_usd), 0) as total, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens FROM usage WHERE date(timestamp) = date('now') GROUP BY engineer_id ORDER BY total DESC`).all();
  }

  getTeamMonthSpend(teamId) {
    const engs = this.getEngineersByTeam(teamId);
    if (engs.length === 0) return 0;
    const ids = engs.map(e => `'${e.id.replace(/'/g, "''")}'`).join(",");
    const row = this.db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage WHERE engineer_id IN (${ids}) AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')`).get();
    return row.total;
  }

  resetAll() {
    this.db.exec(`DELETE FROM budgets; DELETE FROM teams; DELETE FROM engineers; DELETE FROM allocations;`);
  }

  close() { if (this.db) this.db.close(); }
}

module.exports = { Store };
