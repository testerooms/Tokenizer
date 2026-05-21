#!/usr/bin/env node
const { Store, DB_PATH } = require("./src/store");
const { startProxy } = require("./src/proxy");

const cmd = process.argv[2];

function printStatus() {
  const store = new Store();
  store.init();

  const total = store.getTotalSpendThisMonth();
  const engineers = store.getAllEngineerSummaries();
  const recent = store.getRecentUsage(10);

  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║        TOKENIZER — STATUS           ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
  console.log(`  Total spend this month: $${total.toFixed(2)}`);
  console.log(`  Engineers tracked:      ${engineers.length}`);
  console.log(`  DB location:            ${DB_PATH}\n`);

  if (engineers.length > 0) {
    console.log(`  ── Per Engineer ──`);
    console.log(`  ${"ENGINEER".padEnd(20)} ${"REQS".padEnd(6)} ${"AVG".padEnd(8)} ${"TOTAL"}`);
    console.log(`  ${"─".repeat(20)} ${"─".repeat(6)} ${"─".repeat(8)} ${"─".repeat(8)}`);
    for (const e of engineers) {
      console.log(`  ${e.engineer_id.padEnd(20)} ${String(e.requests).padEnd(6)} $${(e.avg_cost || 0).toFixed(4).padEnd(6)} $${e.total.toFixed(2)}`);
    }
    console.log();
  }

  if (recent.length > 0) {
    console.log(`  ── Last ${Math.min(recent.length, 5)} Requests ──`);
    for (const r of recent.slice(0, 5)) {
      const d = r.timestamp.slice(0, 19).replace("T", " ");
      console.log(`  ${d}  ${r.engineer_id.padEnd(16)} ${r.model.padEnd(20)} $${r.cost_usd.toFixed(4)}`);
    }
    console.log();
  }

  store.close();
}

function printSetup() {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║        TOKENIZER — SETUP            ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
  console.log(`  Add this to your opencode config (~/.config/opencode/opencode.json):\n`);
  console.log(`    {`);
  console.log(`      "apiUrl": "http://127.0.0.1:3080"`);
  console.log(`    }\n`);
  console.log(`  Or set the environment variable:\n`);
  console.log(`    export OPENCODE_API_URL=http://127.0.0.1:3080\n`);
  console.log(`  For Claude Code, configure:\n`);
  console.log(`    CLAUDE_API_URL=http://127.0.0.1:3080/v1\n`);
  console.log(`  Make sure tokenizer is running in another terminal:\n`);
  console.log(`    tokenizer watch\n`);
}

function printHelp() {
  console.log(`\n  tokenizer — Anthropic API cost sidecar\n`);
  console.log(`  USAGE`);
  console.log(`    tokenizer watch [port]   Start the sidecar proxy`);
  console.log(`    tokenizer status         Show current spend & history`);
  console.log(`    tokenizer setup          Print config instructions`);
  console.log(`    tokenizer help           Show this message\n`);
  console.log(`  EXAMPLE`);
  console.log(`    tokenizer watch          # proxy on :3080`);
  console.log(`    tokenizer watch 3090     # proxy on :3090\n`);
}

switch (cmd) {
  case "watch": {
    const port = parseInt(process.argv[3]) || 3080;
    const store = new Store();
    store.init();
    console.log(`  TOKENIZER sidecar starting...\n`);
    startProxy(store, port);
    break;
  }
  case "status":
    printStatus();
    break;
  case "setup":
    printSetup();
    break;
  case "help":
  case "--help":
  case "-h":
  default:
    printHelp();
    break;
}
