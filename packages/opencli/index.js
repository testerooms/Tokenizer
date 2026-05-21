#!/usr/bin/env node
const { Store } = require("./src/store");
const { sendNotifications } = require("./src/notify");
const fs = require("fs");
const path = require("path");

const cmd = process.argv[2];

// ── Helpers ──

function loadConfig(filePath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  if (filePath.endsWith(".json")) return JSON.parse(raw);
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
    let parse;
    try { parse = require("yaml").parse; } catch {
      try { parse = require("/home/uvtest/claude-cost-guardian/node_modules/yaml/dist/index.js").parse; } catch {
        throw new Error("yaml parser not found. Install: npm install yaml");
      }
    }
    return parse(raw);
  }
  try { return JSON.parse(raw); } catch { throw new Error("Unsupported config format. Use .json or .yml"); }
}

function makeBar(ratio) {
  const w = 15;
  const filled = Math.round(Math.min(ratio, 1) * w);
  return "█".repeat(filled) + "░".repeat(w - filled);
}

function printUSD(v) { return `$${(v || 0).toFixed(2)}`; }
function printUSDFine(v) { return `$${(v || 0).toFixed(4)}`; }

// ── APPLY ──

function cmdApply() {
  const filePath = process.argv[3];
  if (!filePath) { console.log("Usage: opencli apply <config.json|config.yml>"); process.exit(1); }
  const cfg = loadConfig(filePath);
  const store = new Store();
  store.init();

  let engCount = 0, teamCount = 0;

  if (cfg.teams) {
    for (const team of cfg.teams) {
      const teamId = team.id || team.name.toLowerCase().replace(/\s+/g, "-");
      store.upsertTeam(teamId, team.name, team.monthly_budget || 0, team.daily_budget || 0);
      teamCount++;
      if (team.engineers) {
        for (const eng of team.engineers) {
          store.upsertEngineer(
            eng.id, eng.email || `${eng.id}@company.com`, eng.name || eng.id,
            teamId, eng.role || "engineer", eng.tier || "standard",
            eng.daily_budget || team.daily_budget || 0,
            eng.monthly_budget || team.monthly_budget || 0
          );
          engCount++;
        }
      }
    }
  }

  if (cfg.engineers) {
    for (const eng of cfg.engineers) {
      store.upsertEngineer(
        eng.id, eng.email || `${eng.id}@company.com`, eng.name || eng.id,
        eng.team || "default", eng.role || "engineer", eng.tier || "standard",
        eng.daily_budget || 0, eng.monthly_budget || 0
      );
      engCount++;
    }
  }

  console.log(`\n  ✓ Applied ${path.basename(filePath)} — ${teamCount} teams, ${engCount} engineers.`);
  store.close();
}

// ── ALLOC ──

function cmdAlloc() {
  const engine = process.argv[3];
  const amount = parseFloat(process.argv[4]);
  if (!engine || isNaN(amount)) { console.log("Usage: opencli alloc <engineer_id> <daily_amount_usd>"); process.exit(1); }
  const store = new Store();
  store.init();
  store.setDailyBudget(engine, amount);
  console.log(`  ✓ Daily budget for "${engine}" set to ${printUSD(amount)}`);
  store.close();
}

// ── ADMIN ──

function cmdAdmin() {
  const sub = process.argv[3];

  if (sub === "allocate") {
    const email = process.argv[4];
    const tokens = parseInt(process.argv[5]);
    const budgetUsd = parseFloat(process.argv[6]) || 0;
    const note = process.argv.slice(7).join(" ") || "";

    if (!email || isNaN(tokens)) {
      console.log(`\n  Usage: opencli admin allocate <email> <tokens> [budget_usd] [note]\n`);
      console.log(`  Example: opencli admin allocate alice@company.com 500000 15 "Q2 research budget"\n`);
      process.exit(1);
    }

    const store = new Store();
    store.init();

    let engineerId = email.split("@")[0];
    const existing = store.getEngineerByEmail(email);
    if (existing) engineerId = existing.id;

    // Create the allocation
    const allocId = store.createAllocation(email, engineerId, tokens, budgetUsd, "admin", "daily", note);

    // Update engineer's budget
    store.upsertEngineer(engineerId, email, existing?.name || engineerId, existing?.team_id || "", existing?.role || "engineer", existing?.tier || "standard", budgetUsd, 0);

    console.log(`\n  ${"✓".repeat(1)} Allocation #${allocId} created\n`);

    // Send notifications
    sendNotifications(store, email, engineerId, tokens, budgetUsd, "admin", note);

    store.close();
    return;
  }

  if (sub === "engineers" || sub === "list") {
    const store = new Store();
    store.init();
    const engineers = store.getAllEngineers();

    console.log(`\n  ── Engineers (${engineers.length}) ──\n`);
    console.log(`  ${"ID".padEnd(14)} ${"EMAIL".padEnd(28)} ${"ROLE".padEnd(12)} ${"TEAM".padEnd(14)} ${"DAILY"}`);
    console.log(`  ${"─".repeat(14)} ${"─".repeat(28)} ${"─".repeat(12)} ${"─".repeat(14)} ${"─".repeat(7)}`);
    for (const e of engineers) {
      console.log(`  ${e.id.padEnd(14)} ${e.email.padEnd(28)} ${e.role.padEnd(12)} ${(e.team_id || "").padEnd(14)} ${printUSD(e.daily_budget_usd)}`);
    }
    console.log();
    store.close();
    return;
  }

  if (sub === "allocations" || sub === "allocs") {
    const store = new Store();
    store.init();
    const allocs = store.getAllocations(30);

    console.log(`\n  ── Allocations (last ${allocs.length}) ──\n`);
    console.log(`  ${"#".padEnd(4)} ${"EMAIL".padEnd(28)} ${"TOKENS".padEnd(12)} ${"BUDGET".padEnd(8)} ${"BY".padEnd(10)} ${"DATE"}`);
    console.log(`  ${"─".repeat(4)} ${"─".repeat(28)} ${"─".repeat(12)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(20)}`);
    for (const a of allocs) {
      const d = (a.created_at || "").slice(0, 10);
      console.log(`  ${String(a.id).padEnd(4)} ${a.engineer_email.padEnd(28)} ${String(a.tokens_allocated).padEnd(12)} ${printUSD(a.budget_usd).padEnd(8)} ${a.allocated_by.padEnd(10)} ${d}`);
    }
    console.log();
    store.close();
    return;
  }

  if (sub === "add-engineer" || sub === "add") {
    const email = process.argv[4];
    const role = process.argv[5] || "engineer";
    const team = process.argv[6] || "default";
    if (!email) { console.log("Usage: opencli admin add-engineer <email> [role] [team]"); process.exit(1); }
    const store = new Store();
    store.init();
    const id = email.split("@")[0];
    store.upsertEngineer(id, email, id, team, role, "standard", 0, 0);
    console.log(`  ✓ Added ${email} as ${role} on team "${team}"`);
    store.close();
    return;
  }

  // Config subcommands
  if (sub === "config") {
    const key = process.argv[4];
    const value = process.argv[5];
    if (!key || !value) {
      console.log("Usage: opencli admin config <key> <value>");
      console.log("  opencli admin config notifications.slack.webhook_url https://hooks.slack.com/...");
      console.log('  opencli admin config notifications.slack.enabled true');
      console.log("  opencli admin config notifications.email.enabled true");
      process.exit(1);
    }
    const store = new Store();
    store.init();
    const parsed = value === "true" ? true : value === "false" ? false : isNaN(value) ? value : parseFloat(value);
    store.setConfig(key, parsed);
    console.log(`  ✓ Config updated: ${key} = ${parsed}`);
    store.close();
    return;
  }

  // Default: show admin help
  console.log(`\n  opencli admin — Enterprise administration\n`);
  console.log(`  COMMANDS`);
  console.log(`    allocate <email> <tokens> [budget] [note]    Allocate tokens to engineer`);
  console.log(`    add-engineer <email> [role] [team]           Add an engineer with role`);
  console.log(`    engineers | list                             List all engineers`);
  console.log(`    allocations | allocs                         Show allocation history`);
  console.log(`    config <key> <value>                         Set notification config\n`);
  console.log(`  ROLES: admin, manager, engineer`);
  console.log(`  EXAMPLES`);
  console.log(`    opencli admin add-engineer bob@co.com manager platform`);
  console.log(`    opencli admin allocate alice@co.com 100000 15`);
  console.log(`    opencli admin config notifications.slack.webhook_url https://...`);
  console.log(`    opencli admin config notifications.slack.enabled true\n`);
}

// ── STATUS ──

function cmdStatus(user) {
  const store = new Store();
  store.init();

  if (user) {
    const eng = store.getEngineer(user);
    const budget = store.getBudget(user);
    const daily = store.getTodaySpend(user);
    const monthly = store.getMonthSpend(user);
    const models = store.getSpendByModel(user);

    const roleTag = eng ? ` [${eng.role}]` : "";
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║    ${(user + roleTag).padEnd(35)}║`);
    if (budget.source !== "none") console.log(`  ║    ${budget.source} budget${eng?.team_id ? " · " + eng.team_id : ""}${" ".repeat(20)}║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);

    console.log(`  TODAY`);
    console.log(`  ${"─".repeat(40)}`);
    const remaining = Math.max(0, budget.daily_budget_usd - daily.cost);
    const pct = budget.daily_budget_usd > 0 ? ((daily.cost / budget.daily_budget_usd) * 100).toFixed(1) : "—";
    console.log(`  Spent:       ${printUSDFine(daily.cost)}  (${daily.tokens.toLocaleString()} tokens)`);
    console.log(`  Budget:      ${printUSD(budget.daily_budget_usd)}`);
    console.log(`  Remaining:   ${printUSDFine(remaining)}`);
    if (budget.daily_budget_usd > 0) console.log(`  Utilization: ${makeBar(daily.cost / budget.daily_budget_usd)}  ${pct}%`);
    console.log();

    console.log(`  MONTH`);
    console.log(`  ${"─".repeat(40)}`);
    console.log(`  Spent:       ${printUSD(monthly.cost)}  (${monthly.tokens.toLocaleString()} tokens)`);
    if (budget.monthly_budget_usd > 0) {
      console.log(`  Remaining:   ${printUSD(Math.max(0, budget.monthly_budget_usd - monthly.cost))}`);
    }
    console.log();

    if (models.length > 0) {
      console.log(`  BY MODEL`);
      console.log(`  ${"─".repeat(40)}`);
      for (const m of models) console.log(`  ${m.model.padEnd(22)} ${printUSD(m.total)}  (${m.requests} reqs)`);
      console.log();
    }

    const allocs = store.getAllocationsByEmail(user);
    if (allocs.length > 0) {
      console.log(`  ALLOCATIONS`);
      console.log(`  ${"─".repeat(40)}`);
      for (const a of allocs.slice(0, 5)) {
        const d = (a.created_at || "").slice(0, 10);
        console.log(`  ${d}  ${a.tokens_allocated.toLocaleString().padEnd(12)} tokens  ${printUSD(a.budget_usd)}`);
      }
      console.log();
    }
  } else {
    const engineers = store.getDailySpendToday();
    const allEng = store.getAllEngineers();
    const teams = store.getAllTeams();

    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║    TOKENIZER — ENTERPRISE REPORT          ║`);
    console.log(`  ╚══════════════════════════════════════════════╝\n`);

    if (engineers.length === 0 && allEng.length === 0) {
      console.log(`  No activity yet. Run tokenizer watch alongside opencode.\n`);
      store.close();
      return;
    }

    if (teams.length > 0) {
      for (const team of teams) {
        const teamEng = store.getEngineersByTeam(team.team_id);
        const teamSpend = store.getTeamMonthSpend(team.team_id);
        const teamPct = team.monthly_budget_usd > 0 ? ((teamSpend / team.monthly_budget_usd) * 100).toFixed(1) : "—";
        console.log(`  ── ${team.name} (monthly: ${printUSD(teamSpend)} / ${printUSD(team.monthly_budget_usd)} — ${teamPct}%) ──`);
        console.log(`  ${"USER".padEnd(16)} ${"SPENT".padEnd(10)} ${"BUDGET".padEnd(10)} ${"LEFT".padEnd(10)} ${"UTIL"} ${"ROLE".padEnd(10)}`);
        console.log(`  ${"─".repeat(16)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(5)} ${"─".repeat(10)}`);
        for (const eng of teamEng) {
          const spent = engineers.find(e => e.engineer_id === eng.id) || { total: 0, tokens: 0 };
          const limit = eng.daily_budget_usd || team.default_daily_budget_usd || 0;
          const rem = Math.max(0, limit - spent.total);
          const pct = limit > 0 ? `${((spent.total / limit) * 100).toFixed(0)}%` : "—";
          console.log(`  ${eng.id.padEnd(16)} ${printUSDFine(spent.total).padEnd(9)} ${printUSD(limit).padEnd(9)} ${printUSDFine(rem).padEnd(9)} ${pct.padEnd(5)} ${eng.role.padEnd(10)}`);
        }
        console.log();
      }
    } else {
      // Fallback: show all engineers flat
      console.log(`  ${"USER".padEnd(16)} ${"SPENT".padEnd(10)} ${"BUDGET".padEnd(10)} ${"LEFT".padEnd(10)} ${"UTIL"} ${"ROLE".padEnd(10)}`);
      console.log(`  ${"─".repeat(16)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(5)} ${"─".repeat(10)}`);
      for (const eng of allEng) {
        const spent = engineers.find(e => e.engineer_id === eng.id) || { total: 0, tokens: 0 };
        const limit = eng.daily_budget_usd || 0;
        const rem = Math.max(0, limit - spent.total);
        const pct = limit > 0 ? `${((spent.total / limit) * 100).toFixed(0)}%` : "—";
        console.log(`  ${eng.id.padEnd(16)} ${printUSDFine(spent.total).padEnd(9)} ${printUSD(limit).padEnd(9)} ${printUSDFine(rem).padEnd(9)} ${pct.padEnd(5)} ${eng.role.padEnd(10)}`);
      }
      console.log();
    }

    // Unbudgeted
    const unbudgeted = engineers.filter(e => !allEng.find(a => a.id === e.engineer_id));
    if (unbudgeted.length > 0) {
      console.log(`  ── Unbudgeted Activity ──`);
      for (const e of unbudgeted) console.log(`  ${e.engineer_id.padEnd(16)} ${printUSDFine(e.total)}  (${e.tokens.toLocaleString()} tokens)`);
      console.log();
    }
  }

  store.close();
}

// ── REMAINING ──

function cmdRemaining(user) {
  const store = new Store();
  store.init();
  const eng = store.getEngineer(user);
  const budget = store.getBudget(user);
  const daily = store.getTodaySpend(user);

  if (budget.daily_budget_usd === 0 && budget.source === "none") {
    console.log(`\n  No budget for "${user}". Allocate one: opencli admin allocate ${user}@company.com <tokens> <budget>\n`);
    store.close();
    return;
  }

  const remaining = Math.max(0, budget.daily_budget_usd - daily.cost);
  const pct = budget.daily_budget_usd > 0 ? (daily.cost / budget.daily_budget_usd) * 100 : 0;

  console.log(`\n  ${user}${eng ? " [" + eng.role + "]" : ""} — Remaining Today (${budget.source} budget)`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Budget:   ${printUSD(budget.daily_budget_usd)}`);
  console.log(`  Used:     ${printUSDFine(daily.cost)}  (${daily.tokens.toLocaleString()} tokens)`);
  console.log(`  Left:     ${printUSDFine(remaining)}`);
  console.log(`  Status:   ${pct >= 90 ? "🔴 CRITICAL" : pct >= 75 ? "🟡 Warning" : "🟢 OK"}`);

  if (daily.cost > 0) {
    const daysLeft = budget.daily_budget_usd / daily.cost;
    if (daysLeft > 1) console.log(`  Est. days: ${daysLeft.toFixed(1)}x at current rate`);
    else {
      const hours = new Date().getHours() || 1;
      const hrsLeft = remaining / (daily.cost / hours);
      console.log(`  Hours left: ~${hrsLeft.toFixed(1)}h at current burn rate`);
    }
  }
  console.log();
  store.close();
}

function cmdSummary() {
  const store = new Store();
  store.init();
  const total = store.getDailySpendToday().reduce((s, e) => s + e.total, 0);
  console.log(`${printUSD(total)} today`);
  store.close();
}

function cmdDashboard() {
  const port = parseInt(process.argv[3]) || 3081;
  const { startDashboard } = require("./src/dashboard");
  startDashboard(port);
}

// ── HELP ──

function printHelp() {
  console.log(`\n  opencli — Enterprise token budget management\n`);
  console.log(`  USAGE`);
  console.log(`    opencli apply <config>               Provision teams & engineers`);
  console.log(`    opencli alloc <id> <daily>$           Set personal daily budget`);
  console.log(`    opencli status [user]                 Detailed budget vs usage`);
  console.log(`    opencli remaining <user>              Remaining budget & burn rate`);
  console.log(`    opencli report                        Enterprise-wide team report`);
  console.log(`    opencli summary                       Quick total spend today`);
  console.log(`    opencli admin ...                     Admin commands (see opencli admin)`);
  console.log(`    opencli help                          This message\n`);
}

// ── ROUTER ──

switch (cmd) {
  case "apply":         cmdApply(); break;
  case "alloc":         cmdAlloc(); break;
  case "admin":         cmdAdmin(); break;
  case "status":        cmdStatus(process.argv[3] || null); break;
  case "remaining": {
    const u = process.argv[3];
    if (!u) { console.log("Usage: opencli remaining <user>"); process.exit(1); }
    cmdRemaining(u);
    break;
  }
  case "report":        cmdStatus(null); break;
  case "summary":       cmdSummary(); break;
  case "dashboard":     cmdDashboard(); break;
  case "help":
  case "--help":
  case "-h":
  default:              printHelp(); break;
}
