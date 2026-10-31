// Scans files that would be published (tracked or staged) for API keys and private words.
// Usage: node scripts/check-secrets.mjs [--staged]
// Private words (business name, personal e-mail, phone...) go in .secrets-denylist, one per line.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PATTERNS = [
  ["Brevo API key", /xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/],
  ["Brevo SMTP key", /xsmtpsib-[a-f0-9]{64}-[A-Za-z0-9]{16}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["SendGrid API key", /SG\.[\w-]{22}\.[\w-]{43}/],
  ["AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["OpenAI-style key", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ["Groq API key", /\bgsk_[A-Za-z0-9]{40,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Filled-in secret variable", /^[ \t]*[A-Z0-9_]*(KEY|SECRET|PASS|PASSWORD|TOKEN)[ \t]*=[ \t]*[^\s#$"'{][^\s#]{7,}/m],
];
const FORBIDDEN_FILES = [/(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)/, /\.db$/, /(^|\/)revezo\.config\.yaml$/];

const staged = process.argv.includes("--staged");
const args = staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"] : ["ls-files"];
let files;
try {
  files = execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  console.error("check-secrets: not a git repository, nothing to scan.");
  process.exit(0);
}

const denylist = existsSync(".secrets-denylist")
  ? readFileSync(".secrets-denylist", "utf8").split(/\r?\n/).map((w) => w.trim()).filter((w) => w && !w.startsWith("#"))
  : [];

const problems = [];
for (const file of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(file))) problems.push(`${file}: this file must never be committed`);
  if (!existsSync(file) || file === "scripts/check-secrets.mjs") continue;
  const text = staged
    ? execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 20e6 })
    : readFileSync(file, "utf8");
  if (text.includes("\u0000")) continue; // binary
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: looks like a ${name}`);
  const lower = text.toLowerCase();
  for (const word of denylist) if (lower.includes(word.toLowerCase())) problems.push(`${file}: contains a word from .secrets-denylist`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`check-secrets: ${files.length} files clean.`);
