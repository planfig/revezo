import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { ConfigError } from "../src/core/errors.ts";
import { EventLog } from "../src/core/events.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();

const API_KEY = "k".repeat(32);
const SECRETS_KEY = "s".repeat(32);
const SECRET = "brevo-test-secret-value-123";
const message = { from: { email: "news@example.com" }, to: [{ email: "jane@example.com" }], subject: "Hello", text: "Hi" };

const dirs: string[] = [];
const managers: Manager[] = [];
after(() => {
  for (const m of managers) m.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "revezo-test-"));
  dirs.push(dir);
  return join(dir, "storage.sqlite");
}

/** Fake provider APIs that record which provider was called and with which key. */
function fakeFetch(calls: { provider: string; key: string | null }[], hold?: Promise<void>): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ provider: url.includes("mailjet") ? "mailjet" : "brevo", key: headers.get("api-key") ?? headers.get("authorization") });
    if (hold && url.includes("brevo")) await hold;
    return url.includes("mailjet")
      ? Response.json({ Messages: [{ Status: "success", To: [{ MessageID: 1 }] }] })
      : Response.json({ messageId: "<1@example.com>" }, { status: 201 });
  };
}

interface SetupOptions {
  storagePath?: string | null;
  secretsKey?: string;
  apiKey?: string;
  hold?: Promise<void>;
}

/** Options left out get working defaults; options given as undefined stay unset. */
function setup(opts: SetupOptions = {}) {
  const storagePath = "storagePath" in opts ? opts.storagePath : tempDb();
  const secretsKey = "secretsKey" in opts ? opts.secretsKey : SECRETS_KEY;
  const apiKey = "apiKey" in opts ? opts.apiKey : API_KEY;
  const hold = opts.hold;
  const calls: { provider: string; key: string | null }[] = [];
  const events = new EventLog();
  const config = buildConfig(
    {
      defaults: { email: "mail" },
      routes: {
        mail: {
          kind: "email",
          providers: [
            { use: "brevo", options: { apiKey: "file-key" }, limits: { perDay: 300 } },
            { use: "mailjet", options: { apiKey: "mj", apiSecret: "mj-secret" }, limits: { perDay: 200 } },
          ],
        },
      },
    },
    { env: {}, fetch: fakeFetch(calls, hold), store: new MemoryQuotaStore(), hubOptions: { onAttempt: (r, a) => events.add(r, a) } },
  );
  const manager = new Manager({
    hub: config.hub,
    ctx: config.pluginContext,
    storagePath: storagePath ?? undefined,
    secretsKey,
    defaults: config.defaults,
  });
  managers.push(manager);
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey, events, manager });
  const call = (method: string, path: string, body?: unknown, key = API_KEY) =>
    app.request(path, {
      method,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  return { hub: config.hub, manager, app, call, calls, storagePath };
}

test("route changes apply to the next call while running calls finish on the old route", async () => {
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const { hub, call, calls } = setup({ hold });

  const running = hub.send("mail", message); // brevo is first and waits
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await call("PATCH", "/v1/admin/routes/mail", { order: ["mailjet", "brevo"] })).status, 200);

  const next = await hub.send("mail", message);
  assert.equal(next.provider, "mailjet");
  release();
  assert.equal((await running).provider, "brevo");

  assert.equal((await call("PATCH", "/v1/admin/providers/mailjet", { paused: true })).status, 200);
  assert.equal((await hub.send("mail", message)).provider, "brevo");
  assert.deepEqual(calls.map((c) => c.provider), ["brevo", "mailjet", "brevo"]);
  assert.equal((await call("PATCH", "/v1/admin/providers/brevo", { paused: true })).status, 200);
  await assert.rejects(hub.send("mail", message), (err: any) =>
    err.attempts.every((a: any) => a.outcome === "skipped_paused") && err.attempts.length === 2);
  assert.equal(calls.length, 3);

  assert.equal((await call("PATCH", "/v1/admin/routes/mail", { strategy: "least-used" })).status, 200);
  assert.equal(hub.route("mail")!.strategy, "least-used");
});

test("a provider added on the dashboard is used at once, survives a restart and its keys are encrypted", async () => {
  const storagePath = tempDb();
  const first = setup({ storagePath });
  assert.equal((await first.call("POST", "/v1/admin/routes", { name: "tx", kind: "email", strategy: "priority" })).status, 200);
  const res = await first.call("POST", "/v1/admin/providers", { route: "tx", use: "brevo", name: "brevo-tx", options: { apiKey: SECRET } });
  assert.equal(res.status, 200);
  assert.ok(!(await res.text()).includes(SECRET));
  assert.equal((await first.call("PATCH", "/v1/admin/providers/brevo-tx", { limits: { perDay: 50 }, weight: 3 })).status, 200);
  assert.equal((await first.hub.send("tx", message)).provider, "brevo-tx");
  assert.equal(first.calls.at(-1)!.key, SECRET);
  first.manager.close();

  // Nothing readable on disk: not in the rows, not anywhere in the file.
  const db = new DatabaseSync(storagePath);
  const rows = JSON.stringify(db.prepare("SELECT * FROM panel_providers").all());
  db.close();
  assert.ok(!rows.includes(SECRET));
  assert.match(rows, /"options":"v1\./);
  assert.ok(!readFileSync(storagePath).includes(SECRET));

  const second = setup({ storagePath });
  const tx = second.hub.route("tx")!;
  assert.equal(tx.providers[0].name, "brevo-tx");
  assert.deepEqual(tx.providers[0].limits, { perDay: 50 });
  assert.equal(tx.providers[0].weight, 3);
  await second.hub.send("tx", message);
  assert.equal(second.calls.at(-1)!.key, SECRET);

  second.manager.close();
  assert.throws(() => setup({ storagePath, secretsKey: "w".repeat(32) }), (err: Error) => err instanceof ConfigError && /not the key/.test(err.message));
});

test("no API answer contains a secret, only whether it is set", async () => {
  const { call } = setup();
  await call("POST", "/v1/admin/providers", { route: "mail", use: "smtp", name: "relay", options: { host: "smtp.example.com", user: "u", pass: SECRET } });
  const bad = await call("POST", "/v1/admin/providers", { route: "mail", use: "smtp", name: "relay2", options: { host: SECRET, port: "nope" } });
  assert.equal(bad.status, 400);
  assert.ok(!(await bad.text()).includes(SECRET));

  const text = await (await call("GET", "/v1/admin/state")).text();
  assert.ok(!text.includes(SECRET));
  assert.ok(!text.includes("file-key") && !text.includes("mj-secret"));
  const relay = JSON.parse(text).routes[0].providers.find((p: any) => p.name === "relay");
  assert.deepEqual(relay.secrets, { pass: true });
  assert.equal(relay.source, "panel");
  assert.ok(!(await (await call("GET", "/v1/quota")).text()).includes(SECRET));
});

test("the dashboard is read only without a secrets key, with memory storage or without an API key", async () => {
  const cases: [SetupOptions, string][] = [
    [{ secretsKey: undefined }, "no_secrets_key"],
    [{ storagePath: null }, "memory_storage"],
  ];
  for (const [opts, reason] of cases) {
    const { call } = setup(opts);
    const state = await (await call("GET", "/v1/admin/state")).json();
    assert.equal(state.writable, false);
    assert.equal(state.reason, reason);
    const res = await call("PATCH", "/v1/admin/providers/brevo", { paused: true });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "read_only");
  }
  const open = setup({ apiKey: undefined });
  const noAuth = createServer({ hub: open.hub, defaults: {}, manager: open.manager });
  const state = await (await noAuth.request("/v1/admin/state")).json();
  assert.equal(state.reason, "no_api_key");
  assert.equal((await noAuth.request("/v1/admin/routes", { method: "POST", body: "{}" })).status, 409);
});

test("management needs the API key", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/v1/admin/state", undefined, "wrong")).status, 401);
  assert.equal((await call("DELETE", "/v1/admin/providers/brevo", undefined, "wrong")).status, 401);
});

test("duplicates and file providers are protected", async () => {
  const { call } = setup();
  const add = (body: object) => call("POST", "/v1/admin/providers", body);
  const brevo2 = await add({ route: "mail", use: "brevo", name: "brevo-2", options: { apiKey: "x" } });
  assert.equal(brevo2.status, 409);
  assert.equal((await brevo2.json()).error, "duplicate_account");
  const sameName = await add({ route: "mail", use: "smtp", name: "mailjet", options: { host: "smtp.example.com" } });
  assert.equal((await sameName.json()).error, "duplicate_name");
  assert.equal((await add({ route: "mail", use: "smtp", name: "smtp-a", options: { host: "a.example.com" } })).status, 200);
  assert.equal((await add({ route: "mail", use: "smtp", name: "smtp-b", options: { host: "b.example.com" } })).status, 200);
  assert.equal((await call("POST", "/v1/admin/routes", { name: "mail", kind: "email" })).status, 409);

  const removeFile = await call("DELETE", "/v1/admin/providers/brevo");
  assert.equal(removeFile.status, 403);
  assert.equal((await removeFile.json()).error, "from_file");
  assert.equal((await call("PATCH", "/v1/admin/providers/brevo", { limits: { perDay: 9999 } })).status, 403);
  assert.equal((await call("DELETE", "/v1/admin/routes/mail")).status, 403);
  assert.equal((await call("DELETE", "/v1/admin/providers/smtp-b")).status, 200);
  assert.equal((await call("DELETE", "/v1/admin/providers/nope")).status, 404);
});

test("management input is validated", async () => {
  const { call } = setup();
  const add = async (body: unknown) => (await call("POST", "/v1/admin/providers", body)).json();
  assert.equal((await add({ route: "mail", use: "smtp", name: "../x", options: { host: "h" } })).error, "invalid_name");
  assert.equal((await add({ route: "mail", use: "smtp", options: { host: "h", evil: 1 } })).error, "invalid_options");
  assert.equal((await add({ route: "mail", use: "smtp", name: "s", options: { host: "h\r\nX: y" } })).error, "invalid_options");
  assert.equal((await add({ route: "mail", use: "smtp", name: "s", options: {} })).error, "missing_option");
  assert.equal((await add({ route: "mail", use: "smtp", name: "s", options: { host: "h" }, limits: { perDay: -1 } })).error, "invalid_limits");
  assert.equal((await add({ route: "mail", use: "smtp", name: "s", options: { host: "h" }, admin: true })).error, "unknown_field");
  assert.equal((await add({ route: "mail", use: "nope", options: {} })).error, "unknown_type");
  assert.equal((await add([1, 2])).error, "invalid_body");
  assert.equal((await call("POST", "/v1/admin/providers", "{not json")).status, 400);
  assert.equal((await call("PATCH", "/v1/admin/routes/mail", { order: ["brevo"] })).status, 400);
  assert.equal((await call("PATCH", "/v1/admin/routes/mail", { strategy: "random" })).status, 400);
  const big = await call("POST", "/v1/admin/providers", { route: "mail", use: "smtp", options: { host: "h".repeat(20_000) } });
  assert.equal(big.status, 413);
});

test("suggested limits and capabilities come from the plugin", async () => {
  const { call, hub } = setup();
  await call("POST", "/v1/admin/routes", { name: "news", kind: "email" });
  await call("POST", "/v1/admin/providers", { route: "news", use: "mailjet", name: "mj-news", options: { apiKey: "a", apiSecret: "b" } });
  const p = hub.route("news")!.providers[0];
  assert.deepEqual(p.limits, { perDay: 200, perMonth: 6000 });
  assert.equal(p.adapter.capabilities.allowsMarketing, true);
  const state = await (await call("GET", "/v1/admin/state")).json();
  const brevo = state.plugins.find((x: any) => x.id === "brevo");
  assert.deepEqual(brevo.suggestedLimits, { perDay: 300 });
  assert.deepEqual(brevo.fields, [{ name: "apiKey", label: "API key", type: "string", required: true, secret: true }]);
});

test("events have ids and ?since= returns only newer ones", async () => {
  const { call, hub } = setup();
  await hub.send("mail", message);
  const all = await (await call("GET", "/v1/events")).json();
  assert.equal(all.last, 1);
  assert.equal(all.events[0].id, 1);
  await hub.send("mail", message);
  const fresh = await (await call("GET", "/v1/events?since=1")).json();
  assert.deepEqual(fresh.events.map((e: any) => e.id), [2]);
  assert.equal((await call("GET", "/v1/events?since=-1")).status, 400);
});

test("the live dashboard keeps the strict CSP: nonce on script and style, no inline style attributes", async () => {
  const { app } = setup();
  const res = await app.request("/dashboard");
  const csp = res.headers.get("content-security-policy") ?? "";
  const nonce = /script-src 'nonce-([^']+)'/.exec(csp)![1];
  assert.match(csp, new RegExp(`style-src 'nonce-${nonce.replace(/[+/=]/g, "\\$&")}'`));
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  const html = await res.text();
  assert.equal(html.match(/<script/g)!.length, 1);
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(html.includes(`<style nonce="${nonce}">`));
  assert.ok(!/\sstyle\s*=/.test(html), "no style attributes");
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), "no inline event handlers");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(html), "data is written as text only");
  assert.ok(html.includes("prefers-reduced-motion"));
  const second = (await app.request("/dashboard")).headers.get("content-security-policy");
  assert.notEqual(second, csp, "a new nonce per request");
});
