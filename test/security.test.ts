import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { classifyHttp } from "../src/core/errors.ts";
import { EventLog } from "../src/core/events.ts";
import { shortMessage } from "../src/core/hub.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { registerEmailPlugins, validateEmail } from "../src/plugins/email/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();

const message = {
  from: { email: "news@example.com" },
  to: [{ email: "jane@example.com" }],
  subject: "Hello",
  text: "Hi",
};

function setup() {
  let providerCalls = 0;
  const fakeFetch: typeof fetch = async () => {
    providerCalls++;
    await new Promise((r) => setTimeout(r, 10));
    return Response.json({ messageId: `<m${providerCalls}@example.com>` }, { status: 201 });
  };
  const events = new EventLog();
  const config = buildConfig(
    { routes: { mail: { kind: "email", providers: [{ use: "brevo", options: { apiKey: "test" } }] } }, defaults: { email: "mail" } },
    { env: {}, fetch: fakeFetch, store: new MemoryQuotaStore(), hubOptions: { onAttempt: (r, a) => events.add(r, a) } },
  );
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey: "k".repeat(32), events });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/v1/email/send", {
      method: "POST",
      headers: { authorization: `Bearer ${"k".repeat(32)}`, "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { app, post, calls: () => providerCalls };
}

test("header injection and routing headers are refused", () => {
  assert.ok(validateEmail({ ...message, subject: "Hi\r\nBcc: victim@example.com" }).length);
  assert.ok(validateEmail({ ...message, headers: { Bcc: "victim@example.com" } }).length);
  assert.ok(validateEmail({ ...message, headers: { "X-Campaign": "a\nBcc: x@example.com" } }).length);
  assert.ok(validateEmail({ ...message, to: [{ email: "jane@example.com", name: "J\r\nX: y" }] }).length);
  assert.deepEqual(validateEmail({ ...message, headers: { "X-Campaign": "autumn", "List-Id": "news.example.com" } }), []);
});

test("unsubscribe links must be real https addresses", () => {
  const base = { ...message, category: "marketing" };
  assert.ok(validateEmail({ ...base, unsubscribeUrl: "https://" }).length);
  assert.ok(validateEmail({ ...base, unsubscribeUrl: "https://example.com/u>x" }).length);
  assert.deepEqual(validateEmail({ ...base, unsubscribeUrl: "https://example.com/u?id=1" }), []);
});

test("bodies over 1 MB are refused before parsing", async () => {
  const { post, calls } = setup();
  const res = await post({ ...message, text: "x".repeat(1_100_000) });
  assert.equal(res.status, 413);
  assert.equal(calls(), 0);
});

test("the same Idempotency-Key sends only once, even when requests overlap", async () => {
  const { post, calls } = setup();
  const headers = { "idempotency-key": "order-123-welcome" };
  const [a, b] = await Promise.all([post(message, headers), post(message, headers)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(calls(), 1);
  const reused = await post({ ...message, subject: "Other" }, headers);
  assert.equal(reused.status, 409);
});

test("dashboard is served with a strict content security policy", async () => {
  const { app } = setup();
  const res = await app.request("/dashboard");
  assert.equal(res.status, 200);
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'nonce-[^']+'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  const html = await res.text();
  const nonce = /nonce-([^']+)'/.exec(csp)![1];
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(!/ style="/.test(html), "no inline style attributes (blocked by CSP)");
});

test("events endpoint needs the key and lists attempts without addresses", async () => {
  const { app, post } = setup();
  await post(message);
  assert.equal((await app.request("/v1/events")).status, 401);
  const res = await app.request("/v1/events", { headers: { authorization: `Bearer ${"k".repeat(32)}` } });
  const { events } = await res.json();
  assert.equal(events[0].outcome, "sent");
  assert.ok(!JSON.stringify(events).includes("jane@example.com"));
});

test("provider error text is cleaned before logging", () => {
  const text = shortMessage(new Error("HTTP 400: invalid recipient jane.doe@example.com, phone +351 912 345 678"));
  assert.ok(!text.includes("jane.doe@example.com"));
  assert.ok(!text.includes("912 345 678"));
  assert.match(text, /\[email\].*\[number\]/);
});

test("a sender problem at one provider fails over instead of stopping", () => {
  assert.equal(classifyHttp(400, '{"message":"Sender not verified"}'), "auth");
  assert.equal(classifyHttp(400, '{"message":"invalid email address"}'), "permanent");
});

test("unknown paths answer 404 JSON", async () => {
  const { app } = setup();
  const res = await app.request("/nope");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
