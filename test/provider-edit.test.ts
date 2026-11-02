import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { Manager } from "../src/manager.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { registerLlmPlugins } from "../src/plugins/llm/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();
registerLlmPlugins();

const KEY = "k".repeat(32);
const dir = mkdtempSync(join(tmpdir(), "revezo-edit-"));
const closers: (() => void)[] = [];
after(() => {
  for (const c of closers) c();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

test("a provider's API key can be replaced; an empty key field keeps the saved one", async () => {
  const seen: string[] = [];
  let status = 401;
  const fakeFetch: typeof fetch = async (_url, init) => {
    seen.push(new Headers(init?.headers).get("authorization") ?? "");
    if (status !== 200) return new Response("{}", { status });
    return Response.json({ model: "m", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
  };
  const config = buildConfig({ routes: { ai: { kind: "llm", providers: [] } } }, { env: {}, fetch: fakeFetch, store: new MemoryQuotaStore() });
  const manager = new Manager({ hub: config.hub, storagePath: join(dir, "s.sqlite"), secretsKey: "s".repeat(32), ctx: { fetch: fakeFetch } });
  closers.push(() => manager.close());
  const app = createServer({ hub: config.hub, defaults: { llm: "ai" }, apiKey: KEY, manager });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: `Bearer ${KEY}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const chat = () => call("POST", "/v1/chat/completions", { messages: [{ role: "user", content: "hi" }] });

  assert.equal((await call("POST", "/v1/admin/providers", { route: "ai", use: "groq", options: { apiKey: "old-key-123", model: "small" } })).status, 200);
  assert.equal((await chat()).status, 503, "the old key is refused and the provider is paused");
  const before = await (await call("GET", "/v1/admin/state")).json();
  assert.ok(before.routes[0].providers[0].blocked);
  assert.deepEqual(before.routes[0].providers[0].settings, { model: "small" });

  // Changing only the model keeps the key.
  assert.equal((await call("PATCH", "/v1/admin/providers/groq", { options: { apiKey: "", model: "big" } })).status, 200);
  status = 200;
  assert.equal((await chat()).status, 200, "the pause from the old key is lifted");
  assert.equal(seen.at(-1), "Bearer old-key-123");

  assert.equal((await call("PATCH", "/v1/admin/providers/groq", { options: { apiKey: "new-key-456" } })).status, 200);
  await chat();
  assert.equal(seen.at(-1), "Bearer new-key-456");

  const state = await (await call("GET", "/v1/admin/state")).text();
  assert.ok(!state.includes("new-key-456") && !state.includes("old-key-123"), "keys are never sent back");
  assert.deepEqual(JSON.parse(state).routes[0].providers[0].settings, { model: "big" });

  assert.equal((await call("PATCH", "/v1/admin/providers/groq", { options: { model: "" } })).status, 400, "a required option cannot be emptied");
  assert.equal((await call("PATCH", "/v1/admin/providers/groq", { options: { nope: "x" } })).status, 400);

  // The new key survives a restart.
  manager.close();
  const again = new Manager({ hub: config.hub, storagePath: join(dir, "s.sqlite"), secretsKey: "s".repeat(32), ctx: { fetch: fakeFetch } });
  closers.push(() => again.close());
  await config.hub.send("ai", { messages: [{ role: "user", content: "hi" }] });
  assert.equal(seen.at(-1), "Bearer new-key-456");
});

test("an empty route says that it has no provider yet", async () => {
  const config = buildConfig({ routes: { ai: { kind: "llm", providers: [] } } }, { env: {}, store: new MemoryQuotaStore() });
  const app = createServer({ hub: config.hub, defaults: { llm: "ai" }, apiKey: KEY });
  const res = await app.request("/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${KEY}` }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error.message, /no provider yet/);
});
