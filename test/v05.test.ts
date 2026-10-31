import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { EventLog } from "../src/core/events.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { registerLlmPlugins } from "../src/plugins/llm/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();
registerLlmPlugins();

const KEY = "k".repeat(32);
const dirs: string[] = [];
const closers: (() => void)[] = [];
after(() => {
  for (const c of closers) c();
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "revezo-v05-"));
  dirs.push(dir);
  return dir;
}

function setup(cacheSeconds = 0) {
  const dir = tempDir();
  const storagePath = join(dir, "storage.sqlite");
  let calls = 0;
  const fakeFetch: typeof fetch = async () => {
    calls++;
    return Response.json({ model: "m", choices: [{ message: { content: `answer ${calls}` }, finish_reason: "stop" }], usage: { total_tokens: 7 } });
  };
  const events = new EventLog(200, join(dir, "events.sqlite"));
  closers.push(() => events.close());
  const config = buildConfig(
    { routes: { ai: { kind: "llm", cacheSeconds, providers: [{ use: "groq", options: { apiKey: "g", model: "x" } }] } } },
    { env: {}, fetch: fakeFetch, store: new MemoryQuotaStore(), hubOptions: { onAttempt: (r, a, app) => events.add(r, a, new Date(), app) } },
  );
  const manager = new Manager({ hub: config.hub, storagePath, secretsKey: "s".repeat(32), ctx: { fetch: fakeFetch } });
  closers.push(() => manager.close());
  const app = createServer({ hub: config.hub, defaults: {}, apiKey: KEY, events, manager });
  const call = (method: string, path: string, body?: unknown, key = KEY) =>
    app.request(path, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const chat = (content = "hi", key = KEY, extra = {}) => call("POST", "/v1/chat/completions", { messages: [{ role: "user", content }], ...extra }, key);
  return { app, call, chat, events, hub: config.hub, storagePath, calls: () => calls };
}

test("tokens reported by AI providers are counted per provider", async () => {
  const { chat, hub } = setup();
  await chat();
  await chat("again");
  const p = (await hub.status())[0].providers[0];
  assert.equal(p.usage.day, 2);
  assert.equal(p.meters.tokens.day, 14);
});

test("identical AI requests are answered from the cache while it lasts, without using quota", async () => {
  const { chat, call, calls, hub, events } = setup(60);
  const first = await (await chat("same")).json();
  const second = await (await chat("same")).json();
  assert.equal(first.revezo.cached, false);
  assert.equal(second.revezo.cached, true);
  assert.equal(second.choices[0].message.content, first.choices[0].message.content);
  assert.notEqual(second.id, first.id);
  assert.equal(calls(), 1);
  assert.equal((await hub.status())[0].providers[0].usage.day, 1);
  assert.equal(events.list(1)[0].outcome, "cached");

  await chat("same", KEY, { temperature: 0.9 });
  assert.equal(calls(), 2, "different settings are a different request");

  assert.equal((await call("PATCH", "/v1/admin/routes/ai", { cacheSeconds: 0 })).status, 200);
  await chat("same");
  assert.equal(calls(), 3, "cache off");
  assert.equal((await call("PATCH", "/v1/admin/routes/ai", { cacheSeconds: 999_999 })).status, 400);
});

test("app keys can only send, within their daily limit, and are stored hashed", async () => {
  const { call, chat, events, storagePath } = setup();
  const created = await (await call("POST", "/v1/admin/keys", { name: "booking-site", perDay: 2 })).json();
  assert.match(created.key, /^rvz_/);

  const state = await (await call("GET", "/v1/admin/state")).text();
  assert.ok(!state.includes(created.key), "the key is shown only once");
  assert.equal(JSON.parse(state).appKeys[0].name, "booking-site");

  assert.equal((await chat("hi", created.key)).status, 200);
  assert.equal(events.list(1)[0].app, "booking-site");
  assert.equal((await call("GET", "/v1/admin/state", undefined, created.key)).status, 403);
  assert.equal((await call("POST", "/v1/admin/keys", { name: "x" }, created.key)).status, 403);
  assert.equal((await chat("hi", created.key)).status, 200);
  const third = await chat("hi", created.key);
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error, "app_limit");
  const usage = JSON.parse(await (await call("GET", "/v1/admin/state")).text()).appKeys[0].usage;
  assert.equal(usage.day, 2, "refused calls are not counted");

  assert.equal((await call("POST", "/v1/admin/keys", { name: "booking-site" })).status, 409);
  assert.ok(!readFileSync(storagePath).includes(created.key));
  assert.equal((await call("DELETE", `/v1/admin/keys/${created.id}`)).status, 200);
  assert.equal((await chat("hi", created.key)).status, 401);
  assert.equal((await chat("hi", "rvz_madeup")).status, 401);
});

test("the attempt history survives a restart", () => {
  const path = join(tempDir(), "events.sqlite");
  const first = new EventLog(10, path);
  first.add("ai", { provider: "groq", outcome: "sent" }, new Date(), "bot");
  first.add("ai", { provider: "groq", outcome: "failed", kind: "temporary", message: "timeout" });
  first.close();
  const second = new EventLog(10, path);
  closers.push(() => second.close());
  assert.equal(second.lastId, 2);
  assert.deepEqual(second.list().map((e) => [e.id, e.outcome, e.app ?? null]), [[2, "failed", null], [1, "sent", "bot"]]);
  second.add("ai", { provider: "groq", outcome: "sent" });
  assert.equal(second.lastId, 3);
});
