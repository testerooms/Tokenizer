const http = require("http");
const https = require("https");
const { URL } = require("url");
const { v4: uuidv4 } = require("uuid");
const { calculateCost } = require("./cost");

const TARGET = "https://api.anthropic.com";

function startProxy(store, port = 3080) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
      handleMessages(req, res, store);
    } else if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sidecar: "tokenizer" }));
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`🔎 tokenizer sidecar on http://127.0.0.1:${port}`);
    console.log(`   target: ${TARGET}`);
  });

  return server;
}

function handleMessages(clientReq, clientRes, store) {
  const engineerId = clientReq.headers["x-engineer-id"] || "default";
  const apiKey = clientReq.headers["authorization"];
  const bodyChunks = [];

  clientReq.on("data", (c) => bodyChunks.push(c));
  clientReq.on("end", () => {
    const rawBody = Buffer.concat(bodyChunks).toString();
    let body;
    try { body = JSON.parse(rawBody); } catch { body = {}; }

    const model = body.model || "unknown";

    const targetUrl = new URL(TARGET + clientReq.url);
    const options = {
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey || "",
        "anthropic-version": clientReq.headers["anthropic-version"] || "2023-06-01",
        "Content-Length": Buffer.byteLength(rawBody),
      },
    };

    if (body.stream === true) {
      handleStreaming(targetUrl, options, rawBody, clientRes, store, engineerId, model, body);
    } else {
      handleNonStreaming(targetUrl, options, rawBody, clientRes, store, engineerId, model);
    }
  });
}

function handleNonStreaming(targetUrl, options, rawBody, clientRes, store, engineerId, model) {
  const proxyReq = https.request(options, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (c) => chunks.push(c));
    proxyRes.on("end", () => {
      const raw = Buffer.concat(chunks);
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      clientRes.end(raw);

      if (proxyRes.statusCode === 200) {
        try {
          const parsed = JSON.parse(raw.toString());
          const usage = parsed.usage;
          if (usage && (usage.input_tokens || usage.output_tokens)) {
            const cost = calculateCost(
              model,
              usage.input_tokens || 0,
              usage.output_tokens || 0,
              usage.cache_read_input_tokens || 0,
              usage.cache_creation_input_tokens || 0
            );
            store.record({
              id: uuidv4(),
              engineerId,
              model,
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheReadTokens: usage.cache_read_input_tokens || 0,
              cacheWriteTokens: usage.cache_creation_input_tokens || 0,
              costUSD: cost,
              requestType: "completion",
            });
            console.log(`  ✓ ${engineerId}  ${model}  ${(cost * 1000).toFixed(2)}¢  (in:${usage.input_tokens} out:${usage.output_tokens})`);
          }
        } catch {}
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.error("proxy error:", err.message);
    clientRes.writeHead(502);
    clientRes.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.write(rawBody);
  proxyReq.end();
}

function handleStreaming(targetUrl, options, rawBody, clientRes, store, engineerId, model, body) {
  const proxyReq = https.request(options, (proxyRes) => {
    const newHeaders = { ...proxyRes.headers };
    delete newHeaders["transfer-encoding"];
    clientRes.writeHead(proxyRes.statusCode, newHeaders);

    let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0;

    proxyRes.on("data", (chunk) => {
      clientRes.write(chunk);
      const line = chunk.toString();
      if (line.startsWith("data: ")) {
        try {
          const msg = JSON.parse(line.slice(6));
          if (msg.type === "message_start" && msg.message?.usage) {
            inputTokens = msg.message.usage.input_tokens || 0;
            cacheRead = msg.message.usage.cache_read_input_tokens || 0;
            cacheWrite = msg.message.usage.cache_creation_input_tokens || 0;
          }
          if (msg.type === "message_delta" && msg.usage) {
            outputTokens = msg.usage.output_tokens || 0;
          }
        } catch {}
      }
    });

    proxyRes.on("end", () => {
      clientRes.end();
      if (inputTokens || outputTokens) {
        const cost = calculateCost(model, inputTokens, outputTokens, cacheRead, cacheWrite);
        store.record({
          id: uuidv4(),
          engineerId,
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          costUSD: cost,
          requestType: body.stream ? "stream" : "completion",
        });
        console.log(`  ✓ ${engineerId}  ${model}  ${(cost * 1000).toFixed(2)}¢  (in:${inputTokens} out:${outputTokens})`);
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.error("proxy error:", err.message);
    clientRes.writeHead(502);
    clientRes.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.write(rawBody);
  proxyReq.end();
}

module.exports = { startProxy };
