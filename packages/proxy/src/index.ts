import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db } from "./db";
import { policyEngine } from "./policyEngine";
import { metricsRouter } from "./routes/metrics";
import { alertsRouter } from "./routes/alerts";
import { logger } from "./logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ─── Health check ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", version: "1.0.0" }));

// ─── Internal API for dashboard ───────────────────────────────────────────
app.use("/api/metrics", metricsRouter);
app.use("/api/alerts", alertsRouter);

// ─── Middleware: Authenticate engineer ────────────────────────────────────
app.use("/proxy", (req: Request, res: Response, next: NextFunction) => {
  const engineerId = req.headers["x-engineer-id"] as string;
  const apiKey = req.headers["authorization"] as string;

  if (!engineerId) {
    return res.status(401).json({
      error: "Missing x-engineer-id header. Configure your Claude Code to send this header.",
    });
  }

  if (!apiKey?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }

  (req as any).engineerId = engineerId;
  (req as any).apiKey = apiKey;
  next();
});

// ─── Middleware: Budget enforcement BEFORE forwarding ─────────────────────
app.use("/proxy", async (req: Request, res: Response, next: NextFunction) => {
  const engineerId = (req as any).engineerId;

  const check = await policyEngine.checkBudget(engineerId);

  if (check.blocked) {
    logger.warn(`Request BLOCKED for engineer ${engineerId}: ${check.reason}`);
    return res.status(429).json({
      error: "Budget limit reached",
      reason: check.reason,
      currentSpend: check.currentSpend,
      limit: check.limit,
      resetDate: check.resetDate,
    });
  }

  if (check.warning) {
    res.setHeader("X-Budget-Warning", check.reason ?? "");
    res.setHeader("X-Budget-Utilization", String(check.utilization));
    logger.warn(`Budget warning for engineer ${engineerId}: ${check.reason}`);
  }

  next();
});

// ─── Middleware: Capture request body for token accounting ────────────────
app.use("/proxy", (req: Request, _res: Response, next: NextFunction) => {
  (req as any).capturedBody = req.body;
  next();
});

// ─── Proxy to Anthropic API ───────────────────────────────────────────────
app.use(
  "/proxy",
  createProxyMiddleware({
    target: "https://api.anthropic.com",
    changeOrigin: true,
    pathRewrite: { "^/proxy": "" },
    selfHandleResponse: true,

    on: {
      proxyReq: (proxyReq, req: any) => {
        // Forward the actual API key stored server-side (not the engineer's)
        const masterKey = process.env.ANTHROPIC_API_KEY;
        if (masterKey) {
          proxyReq.setHeader("Authorization", `Bearer ${masterKey}`);
        }
        proxyReq.setHeader("anthropic-version", "2023-06-01");

        // Rewrite body if needed
        if (req.capturedBody) {
          const bodyStr = JSON.stringify(req.capturedBody);
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyStr));
          proxyReq.write(bodyStr);
          proxyReq.end();
        }
      },

      proxyRes: async (proxyRes, req: any, res: any) => {
        let rawBody = "";
        proxyRes.on("data", (chunk: Buffer) => (rawBody += chunk.toString()));
        proxyRes.on("end", async () => {
          // Forward headers and status
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          res.end(rawBody);

          // Parse and record token usage asynchronously
          if (proxyRes.statusCode === 200) {
            try {
              const parsed = JSON.parse(rawBody);
              const usage = parsed?.usage;
              const model = parsed?.model ?? req.capturedBody?.model ?? "unknown";

              if (usage && req.engineerId) {
                await db.recordUsage({
                  engineerId: req.engineerId,
                  model,
                  inputTokens: usage.input_tokens ?? 0,
                  outputTokens: usage.output_tokens ?? 0,
                  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
                  cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
                });

                logger.info(
                  `Usage recorded for ${req.engineerId}: in=${usage.input_tokens} out=${usage.output_tokens}`
                );
              }
            } catch (err) {
              logger.error("Failed to parse response for usage tracking", err);
            }
          }
        });
      },

      error: (err, _req, res: any) => {
        logger.error("Proxy error", err);
        res.status(502).json({ error: "Proxy error", detail: (err as Error).message });
      },
    },
  })
);

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Claude Cost Guardian proxy running on http://localhost:${PORT}`);
  logger.info(`Dashboard API: http://localhost:${PORT}/api/metrics`);
  logger.info(`Proxying Anthropic API at: http://localhost:${PORT}/proxy/v1/messages`);
  db.initialize();
});
