#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowedFiles = new Set([".env.example"]);
const skippedPrefixes = [
  "src/generated/",
  "node_modules/",
  ".next/",
  "public/",
  "download/",
  ".agents/",
  "ibetpro/.agents/",
  "tool-results/",
];
const skippedSuffixes = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2",
  ".zip", ".gz", ".pdf", ".lock",
];

const assignmentPatterns = [
  {
    name: "database URL with embedded password",
    re: /DATABASE_URL\s*=\s*["']?(?:mysql|postgres(?:ql)?):\/\/[^\s:@]+:[^\s@]+@/i,
  },
  {
    name: "Telegram bot token",
    re: /TELEGRAM_BOT_TOKEN\s*=\s*["']?\d{6,}:[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "hard-coded odds API key",
    re: /ODDS_API_KEY\s*=\s*["']?[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "hard-coded cron secret",
    re: /CRON_SECRET\s*=\s*["']?[A-Za-z0-9_+\/=.-]{12,}/,
  },
  {
    name: "hard-coded admin password",
    re: /ADMIN_PASSWORD\s*=\s*["']?[^\s"'$\{][^\s"']{7,}/,
  },
  {
    name: "private key material",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function shouldSkip(file) {
  if (allowedFiles.has(file)) return true;
  if (skippedPrefixes.some((prefix) => file.startsWith(prefix))) return true;
  return skippedSuffixes.some((suffix) => file.toLowerCase().endsWith(suffix));
}

function isClearlyNonSecretLine(line) {
  return (
    /process\.env|\$\{|config\.|CHANGE_ME|YOUR_|your_|example|placeholder/i.test(line)
  );
}

const findings = [];

for (const file of trackedFiles()) {
  if (shouldSkip(file)) continue;

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of assignmentPatterns) {
    const match = pattern.re.exec(text);
    if (!match) continue;

    const line = text.slice(0, match.index).split("\n").length;
    const sourceLine = text.split("\n")[line - 1] || "";
    if (isClearlyNonSecretLine(sourceLine)) continue;

    findings.push({
      file,
      line,
      rule: pattern.name,
    });
  }
}

if (findings.length) {
  console.error("Tracked-secret scan failed. Potential plaintext credentials:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} — ${finding.rule}`);
  }
  console.error(
    "Rotate any real credential that was ever committed; removing it from the current tree does not erase Git history."
  );
  process.exit(1);
}

console.log("Tracked-secret scan passed.");
