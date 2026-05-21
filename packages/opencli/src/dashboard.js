const http = require("http");
const { Store } = require("./store");
const { sendNotifications } = require("./notify");
const path = require("path");
const fs = require("fs");

function startDashboard(port = 3081) {
  const html = fs.readFileSync(path.join(__dirname, "dashboard.html"), "utf-8");

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const method = req.method;

    const sendJSON = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(data));
    };

    const sendHTML = () => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    };

    // ── API Routes ──
    if (url.pathname === "/" || url.pathname === "/index.html") return sendHTML();

    if (url.pathname === "/api/engineers" && method === "GET") {
      const store = new Store(); store.init();
      const engineers = store.getAllEngineers();
      const daily = store.getDailySpendToday();
      store.close();
      sendJSON(engineers.map(e => {
        const s = daily.find(d => d.engineer_id === e.id) || { total: 0, tokens: 0 };
        return { ...e, todaySpent: s.total, todayTokens: s.tokens };
      }));
      return;
    }

    if (url.pathname === "/api/teams" && method === "GET") {
      const store = new Store(); store.init();
      const teams = store.getAllTeams();
      store.close();
      sendJSON(teams);
      return;
    }

    if (url.pathname === "/api/allocations" && method === "GET") {
      const store = new Store(); store.init();
      const allocs = store.getAllocations(100);
      store.close();
      sendJSON(allocs);
      return;
    }

    if (url.pathname === "/api/allocate" && method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const { email, tokens, budget, note } = data;
          if (!email || !tokens) return sendJSON({ error: "email and tokens required" }, 400);

          const store = new Store(); store.init();
          const engineerId = email.split("@")[0];
          const existing = store.getEngineerByEmail(email);

          const allocId = store.createAllocation(email, engineerId, parseInt(tokens), parseFloat(budget) || 0, "admin (web)", "daily", note || "");
          store.upsertEngineer(engineerId, email, existing?.name || engineerId, existing?.team_id || "", existing?.role || "engineer", existing?.tier || "standard", parseFloat(budget) || 0, 0);

          await sendNotifications(store, email, engineerId, parseInt(tokens), parseFloat(budget) || 0, "admin (web)", note || "");

          store.close();
          sendJSON({ ok: true, id: allocId });
        } catch (e) {
          sendJSON({ error: e.message }, 500);
        }
      });
      return;
    }

    if (url.pathname === "/api/stats" && method === "GET") {
      const store = new Store(); store.init();
      const daily = store.getDailySpendToday();
      const engineers = store.getAllEngineers();
      const teams = store.getAllTeams();
      const allocs = store.getAllocations(100);

      const totalToday = daily.reduce((s, e) => s + e.total, 0);
      const totalAllocated = allocs.reduce((s, a) => s + a.budget_usd, 0);
      const totalTokens = allocs.reduce((s, a) => s + a.tokens_allocated, 0);

      store.close();
      sendJSON({
        totalToday: Math.round(totalToday * 100) / 100,
        activeEngineers: daily.length,
        totalEngineers: engineers.length,
        totalTeams: teams.length,
        totalAllocated: Math.round(totalAllocated * 100) / 100,
        totalTokensAllocated: totalTokens,
        totalAllocations: allocs.length,
      });
      return;
    }

    sendJSON({ error: "not found" }, 404);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\n  🖥  Tokenizer Admin Dashboard`);
    console.log(`  ─────────────────────────────`);
    console.log(`  http://127.0.0.1:${port}\n`);
  });

  return server;
}

module.exports = { startDashboard };
