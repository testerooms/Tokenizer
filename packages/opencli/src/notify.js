const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function sendSlack(webhookUrl, message) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      text: message,
      mrkdwn: true,
      username: "Tokenizer",
      icon_emoji: ":money_with_wings:",
    });

    const url = new URL(webhookUrl);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url.href,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sendEmail(to, subject, body) {
  try {
    const msg = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    execSync(`sendmail "${to}"`, { input: msg, timeout: 5000 });
    return { ok: true, method: "sendmail" };
  } catch (e) {
    // fallback: write to local file for demo
    const logPath = require("path").join(require("os").homedir(), ".tokenizer", "email.log");
    require("fs").appendFileSync(logPath, `To: ${to}\nSubject: ${subject}\n\n${body}\n---\n`);
    return { ok: true, method: "logged", path: logPath };
  }
}

function printNotification(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note) {
  console.log(`\n${COLORS.cyan}${COLORS.bold}  ─── ALLOCATION SUMMARY ───${COLORS.reset}`);
  console.log(`  Engineer:     ${engineerEmail} (${engineerId})`);
  console.log(`  Tokens:       ${tokens.toLocaleString()}`);
  console.log(`  Budget:       $${budgetUsd.toFixed(2)}`);
  console.log(`  Allocated by: ${allocatedBy}`);
  if (note) console.log(`  Note:         ${note}`);
  console.log(`${COLORS.cyan}${COLORS.bold}  ───────────────────────────${COLORS.reset}\n`);
}

function buildSlackMessage(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note) {
  const costPerMillion = (budgetUsd / (tokens / 1_000_000)).toFixed(2);
  let msg = `:money_with_wings: *New Token Allocation*`;
  msg += `\n• *Engineer:* ${engineerEmail} (${engineerId})`;
  msg += `\n• *Tokens:* ${tokens.toLocaleString()}`;
  msg += `\n• *Budget:* $${budgetUsd.toFixed(2)}`;
  msg += `\n• *Rate:* $${costPerMillion}/M tokens`;
  msg += `\n• *Allocated by:* ${allocatedBy}`;
  if (note) msg += `\n• *Note:* ${note}`;
  msg += `\n• *Status:* Active now — track at \`opencli status ${engineerId}\``;
  return msg;
}

function buildEmailBody(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note) {
  const costPerMillion = (budgetUsd / (tokens / 1_000_000)).toFixed(2);
  let body = `Hello,\n\nYou have been allocated tokens for API usage.\n\n`;
  body += `Engineer ID: ${engineerId}\n`;
  body += `Tokens Allocated: ${tokens.toLocaleString()}\n`;
  body += `Budget: $${budgetUsd.toFixed(2)} ($${costPerMillion}/M tokens)\n`;
  if (note) body += `Note: ${note}\n`;
  body += `\nTrack your usage at any time with:\n  opencli status ${engineerId}\n\n`;
  body += `— Tokenizer Admin\n`;
  return body;
}

async function sendNotifications(store, engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note) {
  const cfg = store.getConfig();
  const results = { printed: false, slack: null, email: null };

  // Always print to console
  printNotification(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note);
  results.printed = true;

  // Slack
  if (cfg.notifications?.slack?.enabled && cfg.notifications.slack.webhook_url) {
    try {
      const slackMsg = buildSlackMessage(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note);
      const res = await sendSlack(cfg.notifications.slack.webhook_url, slackMsg);
      results.slack = res.ok ? "sent" : `failed (${res.status})`;
      if (res.ok) console.log(`  ${COLORS.green}✓ Slack notification sent${COLORS.reset}`);
      else console.log(`  ${COLORS.yellow}! Slack notification: ${res.status}${COLORS.reset}`);
    } catch (e) {
      results.slack = `error: ${e.message}`;
      console.log(`  ${COLORS.red}✗ Slack notification failed: ${e.message}${COLORS.reset}`);
    }
  }

  // Email
  if (cfg.notifications?.email?.enabled) {
    try {
      const subject = `Tokenizer: Token Allocation — ${tokens.toLocaleString()} tokens ($${budgetUsd.toFixed(2)})`;
      const body = buildEmailBody(engineerEmail, engineerId, tokens, budgetUsd, allocatedBy, note);
      const res = sendEmail(engineerEmail, subject, body);
      results.email = res.method;
      if (res.method === "sendmail") console.log(`  ${COLORS.green}✓ Email sent to ${engineerEmail}${COLORS.reset}`);
      else console.log(`  ${COLORS.yellow}! Email logged to ${res.path} (sendmail not available)${COLORS.reset}`);
    } catch (e) {
      results.email = `error: ${e.message}`;
      console.log(`  ${COLORS.red}✗ Email failed: ${e.message}${COLORS.reset}`);
    }
  }

  return results;
}

module.exports = { sendNotifications, printNotification, buildSlackMessage, sendSlack };
