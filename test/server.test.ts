import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { ConfigError } from "../src/core/errors.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();

const env = { BREVO_KEY: "test-brevo", MJ_KEY: "test-mj", MJ_SECRET: "test-mj-secret" };

const rawConfig = {
  defaults: { email: "mail" },
  routes: {
    mail: {
      kind: "email",
      providers: [
        { use: "brevo", options: { apiKey: "${BREVO_KEY}" }, limits: { perDay: 300 } },
        { use: "mailjet", options: { apiKey: "${MJ_KEY}", apiSecret: "${MJ_SECRET}" }, limits: { perDay: 200 } },
      ],
    },
  },
};

const message = {
  from: { email: "news@example.com", name: "Example" },
  to: [{ email: "jane@example.com" }],
  subject: "Hello",
  text: "Hi Jane",
  category: "marketing",
  unsubscribeUrl: "https://example.com/unsubscribe?u=1",
};

/** Fake provider APIs: Brevo answers with a quota error, Mailjet accepts. */
function fakeFetch(log: { url: string; headers: Headers; body: any }[]): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    log.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    if (url.includes("brevo")) return new Response('{"code":"not_enough_credits","message":"daily limit exceeded"}', { status: 402 });
    return Response.json({ Messages: [{ Status: "success", To: [{ MessageID: 123 }] }] });
  };
}

function setup() {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  const config = buildConfig(structuredClone(rawConfig), { env, fetch: fakeFetch(calls), store: new MemoryQuotaStore() });
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey: "secret-key" });
  const post = (body: unknown, key = "secret-key") =>
    app.request("/v1/email/send", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { app, calls, post };
}

test("rejects requests without the right key", async () => {
  const { post, app } = setup();
  assert.equal((await post(message, "wrong")).status, 401);
  assert.equal((await app.request("/health")).status, 200);
});

test("fails over from Brevo to Mailjet and sends unsubscribe headers", async () => {
  const { post, calls } = setup();
  const res = await post(message);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.provider, "mailjet");
  assert.equal(body.result.messageId, "123");
  assert.equal(calls[0].headers.get("api-key"), "test-brevo");
  const mj = calls[1].body.Messages[0];
  assert.equal(mj.Headers["List-Unsubscribe"], "<https://example.com/unsubscribe?u=1>");
  assert.equal(mj.Headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("validates the message", async () => {
  const { post } = setup();
  const res = await post({ ...message, to: [{ email: "not-an-address" }], unsubscribeUrl: undefined });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.problems.length >= 2);
});

test("quota endpoint shows usage per provider", async () => {
  const { post, app } = setup();
  await post(message);
  const res = await app.request("/v1/quota", { headers: { authorization: "Bearer secret-key" } });
  const { routes } = await res.json();
  const [brevo, mailjet] = routes[0].providers;
  assert.equal(brevo.usage.day, 0);
  assert.equal(brevo.blocked.reason, "quota");
  assert.equal(mailjet.usage.day, 1);
});

test("config refuses two accounts of the same provider in one route", () => {
  const dup = structuredClone(rawConfig);
  dup.routes.mail.providers.push({ use: "brevo", name: "brevo-2", options: { apiKey: "${BREVO_KEY}" }, limits: { perDay: 300 } } as any);
  assert.throws(() => buildConfig(dup, { env, store: new MemoryQuotaStore() }), /listed twice/);
});

test("config names a missing variable without showing any value", () => {
  assert.throws(
    () => buildConfig(structuredClone(rawConfig), { env: { BREVO_KEY: "very-secret-value" }, store: new MemoryQuotaStore() }),
    (err: Error) => err instanceof ConfigError && err.message.includes("MJ_KEY") && !err.message.includes("very-secret-value"),
  );
});
