import { Router } from "express";
import { db } from "../db";

export const alertsRouter = Router();

alertsRouter.get("/", (req, res) => {
  const resolved = req.query.resolved === "true";
  res.json(db.getAlerts(resolved));
});
