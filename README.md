# 🛡️ Claude Cost Guardian

> **Stop the Uber problem before it hits you.** An open-source API proxy + FinOps dashboard that sits between your engineers and the Anthropic API — tracking spend, enforcing budget caps, and giving finance teams visibility before your AI bill blows up.

---

## The Problem

In April 2026, Uber exhausted its **entire 2026 AI budget in 4 months** — driven by Claude Code adoption spreading through 5,000 engineers faster than any budget model could anticipate. Per-engineer costs hit **$500–$2,000/month**. No guardrails. No visibility. No plan.

This is a solvable problem.

---

## How It Works

```
Engineer's Claude Code
        │
        ▼
┌───────────────────────┐
│   Claude Cost Guardian│  ← Proxy + Middleware
│   Proxy (port 3001)   │
│                       │
│  1. Auth engineer     │
│  2. Check budget      │  ← Block if over hard limit
│  3. Forward request   │  ← Warn if over soft limit
│  4. Track tokens      │  ← Record usage + cost
│  5. Emit alerts       │
└───────────────────────┘
        │
        ▼
 Anthropic API (real)
        │
        ▼
┌───────────────────────┐
│   Dashboard (port 5173│
│   React + Recharts    │
│                       │
│  • Per-engineer spend │
│  • Team budgets       │
│  • Daily trend chart  │
│  • Blocked engineers  │
└───────────────────────┘
```

---

## Features

| Feature | Status |
|---|---|
| 🔌 API proxy (drop-in for Anthropic API) | ✅ |
| 📊 Per-engineer spend tracking | ✅ |
| 🚦 Soft limit warnings (pass-through with header) | ✅ |
| 🔒 Hard limit enforcement (block with 429) | ✅ |
| 👥 Team-level budget caps | ✅ |
| 📈 Daily spend trend dashboard | ✅ |
| 🏷️ Engineer tiers (standard / power / restricted) | ✅ |
| 🔔 Alert system | ✅ |
| 🗃️ SQLite storage (zero-dependency) | ✅ |
| 📋 YAML policy config | ✅ |
| 🔄 OpenAI Codex / other providers | 🚧 Coming |
| 📧 Slack / email alerts | 🚧 Coming |
| 🔑 SSO / LDAP engineer sync | 🚧 Coming |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Clone & install

```bash
git clone https://github.com/your-org/claude-cost-guardian
cd claude-cost-guardian
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY
```

### 3. Configure budget policy

Edit `config/policy.yaml`:

```yaml
teams:
  default:
    monthlyCapUSD: 5000
    perEngineerSoftLimitUSD: 150   # Warning threshold
    perEngineerHardLimitUSD: 500   # Block threshold
```

### 4. Start the proxy + dashboard

```bash
npm run dev
```

- **Proxy** → `http://localhost:3001`
- **Dashboard** → `http://localhost:5173`
- **Metrics API** → `http://localhost:3001/api/metrics/overview`

### 5. Configure Claude Code to use the proxy

Add to your `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3001/proxy",
    "ANTHROPIC_API_KEY": "your-key-here"
  },
  "http": {
    "headers": {
      "x-engineer-id": "your-engineer-id"
    }
  }
}
```

Or set environment variables:

```bash
export ANTHROPIC_BASE_URL=http://localhost:3001/proxy
export CLAUDE_EXTRA_HEADERS='{"x-engineer-id": "alice@company.com"}'
```

---

## Budget Enforcement

When an engineer hits their **soft limit**, requests pass through but include warning headers:

```
X-Budget-Warning: Soft limit of $150.00 exceeded. Current spend: $162.40 / $500.00 hard limit.
X-Budget-Utilization: 32.48
```

When an engineer hits their **hard limit**, the proxy returns `HTTP 429`:

```json
{
  "error": "Budget limit reached",
  "reason": "Monthly hard limit of $500.00 reached. Spent: $523.10. Resets 2026-06-01.",
  "currentSpend": 523.10,
  "limit": 500.00,
  "resetDate": "2026-06-01T00:00:00.000Z"
}
```

---

## Engineer Tiers

Set per-engineer tiers to multiply their team limits:

| Tier | Multiplier | Use case |
|---|---|---|
| `standard` | 1x | Most engineers |
| `power` | 3x | Staff engineers, ML leads |
| `restricted` | 0.25x | Probation, cost control |

---

## Token Pricing

Guardian uses the latest Anthropic pricing (per million tokens):

| Model | Input | Output | Cache Read | Cache Write |
|---|---|---|---|---|
| claude-opus-4-5 | $15 | $75 | $1.50 | $18.75 |
| claude-sonnet-4-5 | $3 | $15 | $0.30 | $3.75 |
| claude-haiku-4-5 | $0.8 | $4 | $0.08 | $1.00 |

---

## API Reference

### `GET /api/metrics/overview`
Full org overview: total spend, top spenders, trend data.

### `GET /api/metrics/engineers`
Per-engineer spend summaries for the current month.

### `GET /api/metrics/teams`
Team-level budget summaries.

### `GET /api/metrics/trend?days=30`
Daily spend trend (default last 30 days).

### `GET /api/alerts`
Active (unresolved) alerts.

---

## Architecture

```
claude-cost-guardian/
├── packages/
│   ├── proxy/              # Express proxy server
│   │   └── src/
│   │       ├── index.ts        # Main proxy + API server
│   │       ├── db.ts           # SQLite storage layer
│   │       ├── policyEngine.ts # Budget enforcement logic
│   │       ├── logger.ts       # Winston logger
│   │       └── routes/
│   │           ├── metrics.ts  # Dashboard API endpoints
│   │           └── alerts.ts
│   ├── dashboard/          # React dashboard
│   │   └── src/
│   │       └── App.tsx         # Main dashboard UI
│   └── shared/             # Shared TypeScript types
│       └── src/
│           └── index.ts        # Types, pricing constants
├── config/
│   └── policy.yaml         # Budget policy config
└── .env.example
```

---

## Deployment

### Docker (recommended for teams)

```bash
docker build -t claude-cost-guardian .
docker run -e ANTHROPIC_API_KEY=sk-ant-... -p 3001:3001 claude-cost-guardian
```

### Self-hosted

Run the proxy on an internal server. Point all engineers' `ANTHROPIC_BASE_URL` to it. The SQLite DB persists on the server's filesystem.

---

## Contributing

PRs welcome. Especially for:
- Slack / email alert integrations
- OpenAI Codex / Gemini proxy support
- LDAP / Okta engineer sync
- Per-repo or per-project budget attribution

---

## License

MIT
