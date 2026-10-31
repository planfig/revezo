// Runs the server with fake providers and made-up traffic, to try the dashboard.
// Nothing leaves this machine: every provider call is answered by a fake fetch.
// Usage: npm run demo   (then open http://127.0.0.1:8788/dashboard)
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { buildConfig } from "../src/config.ts";
import { EventLog } from "../src/core/events.ts";
import { SqliteQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();

const dir = join(tmpdir(), "revezo-demo");
mkdirSync(dir, { recursive: true });
const sqlite = join(dir, "storage.sqlite");
const apiKey = "demo-dashboard-key-0000000000";
const secretsKey = "demo-secrets-key-not-for-real-use";

const fakeFetch: typeof fetch = async (input) => {
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 300));
  if (Math.random() < 0.08) return new Response('{"message":"upstream hiccup"}', { status: 503 });
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
    defaults: { email: "marketing" },
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
    },
  },
  { env: {}, fetch: fakeFetch, store, hubOptions: { onAttempt: (route, a) => events.add(route, a), sleep: async () => {} } },
);

// Example usage so the wires and bars have something to show.
const now = new Date();
const used = await store.usage("brevo", now, config.timezone);
if (used.day === 0) {
  await store.tryReserve("brevo", {}, 252, now, config.timezone);
  await store.tryReserve("mailjet", {}, 41, now, config.timezone);
  await store.tryReserve("mailjet", {}, 1300, new Date(now.getTime() - 3 * 86_400_000), config.timezone);
  await store.tryReserve("brevo-tx", {}, 18, now, config.timezone);
}

const manager = new Manager({ hub: config.hub, ctx: config.pluginContext, storagePath: sqlite, secretsKey, defaults: config.defaults });
const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey, events, manager });
serve({ fetch: app.fetch, port: 8788, hostname: "127.0.0.1" }, () => {
  console.log(`Demo dashboard: http://127.0.0.1:8788/dashboard\nKey: ${apiKey}\nData: ${dir}`);
});

const message = { from: { email: "demo@example.com" }, to: [{ email: "someone@example.com" }], subject: "Demo", text: "Demo" };
setInterval(() => {
  const route = Math.random() < 0.75 ? "marketing" : "transactional";
  config.hub.send(route, message).catch(() => {});
}, 1600);
