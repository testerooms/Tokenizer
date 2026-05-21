const PRICING = {
  "claude-opus-4-5":      { in: 15, out: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  "claude-sonnet-4-5":    { in: 3,  out: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  "claude-haiku-4-5":     { in: 0.8, out: 4,   cacheRead: 0.08, cacheWrite: 1 },
  "claude-3-5-sonnet":    { in: 3,  out: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  "claude-3-5-haiku":     { in: 0.8, out: 4,   cacheRead: 0.08, cacheWrite: 1 },
  "claude-3-opus":        { in: 15, out: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  "claude-3-sonnet":      { in: 3,  out: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  "claude-3-haiku":       { in: 0.25, out: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
};

function calculateCost(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const p = PRICING[model] || PRICING["claude-sonnet-4-5"];
  return (
    (inputTokens / 1_000_000) * p.in +
    (outputTokens / 1_000_000) * p.out +
    (cacheReadTokens / 1_000_000) * p.cacheRead +
    (cacheWriteTokens / 1_000_000) * p.cacheWrite
  );
}

module.exports = { calculateCost, PRICING };
