// Runs the server with made-up traffic, to try the dashboard without real accounts.
// Nothing leaves this machine: every provider call is answered by a fake fetch.
// Usage: npm run demo   (then open http://127.0.0.1:8788/dashboard)
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { buildConfig } from "../src/config.ts";
import { EventLog } from "../src/core/events.ts";
import { bucketKey, SqliteQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { registerLlmPlugins } from "../src/plugins/llm/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();
registerLlmPlugins();

const dir = join(tmpdir(), "revezo-demo");
mkdirSync(dir, { recursive: true });
const sqlite = join(dir, "storage.sqlite");
const apiKey = "demo-dashboard-key-0000000000";
const secretsKey = "demo-secrets-key-not-for-real-use";

const fakeFetch: typeof fetch = async (input) => {
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 300));
  if (Math.random() < 0.08) return new Response('{"message":"upstream hiccup"}', { status: 503 });
  if (String(input).includes("chat/completions")) {
    return Response.json({ model: "demo-model", choices: [{ message: { content: "Demo answer." }, finish_reason: "stop" }], usage: { total_tokens: 12 } });
  }
  return String(input).includes("mailjet")
    ? Response.json({ Messages: [{ Status: "success", To: [{ MessageID: Date.now() }] }] })
    : Response.json({ messageId: `<${Date.now()}@demo.invalid>` }, { status: 201 });
};

const events = new EventLog();
const store = new SqliteQuotaStore(sqlite);
const config = buildConfig(
  {
    storage: { sqlite },
    timezone: "Europe/Lisbon",
    defaults: { email: "marketing", llm: "ai" },
    routes: {
      marketing: {
        kind: "email",
        strategy: "priority",
        providers: [
          { use: "brevo", options: { apiKey: "fake" }, limits: { perDay: 300 } },
          { use: "mailjet", options: { apiKey: "fake", apiSecret: "fake" }, limits: { perDay: 200, perMonth: 6000 } },
        ],
      },
      transactional: {
        kind: "email",
        strategy: "weighted",
        providers: [{ use: "brevo", name: "brevo-tx", options: { apiKey: "fake" }, limits: { perDay: 300 }, weight: 2 }],
      },
      ai: {
        kind: "llm",
        strategy: "least-used",
        providers: [
          { use: "groq", options: { apiKey: "fake", model: "llama-3.1-8b-instant" }, limits: { perMinute: 30, perDay: 1000 } },
          { use: "openrouter", options: { apiKey: "fake", model: "meta-llama/llama-3.3-70b-instruct:free" }, limits: { perMinute: 20, perDay: 50 } },
          { use: "ollama", name: "ollama-local", options: { model: "llama3.2" } },
        ],
      },
    },
  },
  { env: {}, fetch: fakeFetch, store, hubOptions: { onAttempt: (route, a) => events.add(route, a), sleep: async () => {} } },
);

// Example usage so the wires and bars have something to show.
// Dated an hour back (when still today), so per-minute limits are not filled by the seed.
const now = new Date();
const hourAgo = new Date(now.getTime() - 61 * 60_000);
const seedAt = bucketKey("day", hourAgo, config.timezone) === bucketKey("day", now, config.timezone) ? hourAgo : now;
const used = await store.usage("brevo", now, config.timezone);
if (used.day === 0) {
  await store.tryReserve("brevo", {}, 252, now, config.timezone);
  await store.tryReserve("mailjet", {}, 41, now, config.timezone);
  await store.tryReserve("mailjet", {}, 1300, new Date(now.getTime() - 3 * 86_400_000), config.timezone);
  await store.tryReserve("brevo-tx", {}, 18, now, config.timezone);
  for (const [name, n] of [["groq", 640], ["openrouter", 44], ["ollama-local", 120]] as const) await store.tryReserve(name, {}, n, seedAt, config.timezone);
}

const manager = new Manager({ hub: config.hub, ctx: config.pluginContext, storagePath: sqlite, secretsKey, defaults: config.defaults });
const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey, events, manager });
serve({ fetch: app.fetch, port: 8788, hostname: "127.0.0.1" }, () => {
  console.log(`Demo dashboard: http://127.0.0.1:8788/dashboard\nKey: ${apiKey}\nData: ${dir}`);
});

const message = { from: { email: "demo@example.com" }, to: [{ email: "someone@example.com" }], subject: "Demo", text: "Demo" };
const routes = ["marketing", "transactional", "ai"];
const chat = { messages: [{ role: "user", content: "Hello" }] };
setInterval(() => {
  const route = routes[Math.floor(Math.random() * routes.length)];
  config.hub.send(route, route === "ai" ? chat : message).catch(() => {});
}, 1500);
