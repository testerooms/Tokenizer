import { Router } from "express";
import { db } from "../db";

export const metricsRouter = Router();

metricsRouter.get("/engineers", (_req, res) => {
  try {
    const summaries = db.getAllSpendSummaries();
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch engineer summaries" });
  }
});

metricsRouter.get("/teams", (_req, res) => {
  try {
    const summaries = db.getTeamSummaries();
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team summaries" });
  }
});

metricsRouter.get("/trend", (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trend = db.getDailySpendTrend(days);
    res.json(trend);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trend data" });
  }
});

metricsRouter.get("/overview", (_req, res) => {
  try {
    const engineers = db.getAllSpendSummaries();
    const teams = db.getTeamSummaries();
    const trend = db.getDailySpendTrend(30);

    const totalSpent = engineers.reduce((s, e) => s + e.currentMonthCostUSD, 0);
    const blockedEngineers = engineers.filter((e) => e.status === "blocked").length;
    const warningEngineers = engineers.filter((e) => e.status === "warning" || e.status === "critical").length;

    res.json({
      totalSpentUSD: totalSpent,
      totalEngineers: engineers.length,
      activeEngineers: engineers.filter((e) => e.totalRequests > 0).length,
      blockedEngineers,
      warningEngineers,
      teamCount: teams.length,
      trend,
      topSpenders: engineers
        .sort((a, b) => b.currentMonthCostUSD - a.currentMonthCostUSD)
        .slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});
