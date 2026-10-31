import assert from "node:assert/strict";
import { test } from "node:test";
import { NoProviderAvailableError, PermanentFailureError, ProviderError } from "../src/core/errors.ts";
import { Hub } from "../src/core/hub.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import type { Adapter, ErrorKind, ProviderEntry, Strategy } from "../src/core/types.ts";

/** Fake provider: fails with the given kinds in order, then succeeds. */
function fake(id: string, failures: ErrorKind[] = [], capabilities: Record<string, unknown> = {}) {
  const calls: number[] = [];
  const adapter: Adapter<{ n: number }, string> = {
    id,
    kind: "test",
    capabilities,
    cost: (r) => ({ unit: "unit", amount: r.n }),
    async send(_req, ctx) {
      calls.push(ctx.attempt);
      const kind = failures.shift();
      if (kind) throw new ProviderError(kind, `${id} ${kind}`);
      return `sent by ${id}`;
    },
    classifyError: () => "temporary",
  };
  return { adapter, calls };
}

function entry(name: string, adapter: Adapter, limits = {}, weight = 1): ProviderEntry {
  return { name, adapter, limits, weight };
}

let clock = new Date("2026-10-31T10:00:00Z");
function makeHub(providers: ProviderEntry[], strategy: Strategy = "priority") {
  const hub = new Hub({ store: new MemoryQuotaStore(), now: () => clock, sleep: async () => {} });
  hub.addRoute({ name: "r", kind: "test", strategy, providers, maxAttempts: 3 });
  return hub;
}

test("uses the first provider while it has quota", async () => {
  const a = fake("a");
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter, { perDay: 2 }), entry("b", b.adapter)]);
  assert.equal((await hub.send("r", { n: 1 })).provider, "a");
  assert.equal((await hub.send("r", { n: 1 })).provider, "a");
  const third = await hub.send("r", { n: 1 });
  assert.equal(third.provider, "b");
  assert.equal(third.attempts[0].outcome, "skipped_full");
});

test("fails over on a quota error and keeps the provider paused until the reset", async () => {
  clock = new Date("2026-10-31T10:00:00Z");
  const a = fake("a", ["quota"]);
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter), entry("b", b.adapter)]);
  assert.equal((await hub.send("r", { n: 1 })).provider, "b");
  const next = await hub.send("r", { n: 1 });
  assert.equal(next.provider, "b");
  assert.equal(next.attempts[0].outcome, "skipped_blocked");
  assert.equal(a.calls.length, 1);
  clock = new Date("2026-11-01T00:00:05Z");
  assert.equal((await hub.send("r", { n: 1 })).provider, "a", "back after midnight");
});

test("a failed call does not count against the quota", async () => {
  const a = fake("a", ["rate_limit"]);
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter, { perDay: 5 }), entry("b", b.adapter)]);
  await hub.send("r", { n: 3 });
  const [status] = await hub.status();
  assert.equal(status.providers[0].usage.day, 0);
  assert.equal(status.providers[1].usage.day, 3);
});

test("retries temporary errors on the same provider before moving on", async () => {
  const a = fake("a", ["temporary", "temporary"]);
  const hub = makeHub([entry("a", a.adapter)]);
  const res = await hub.send("r", { n: 1 });
  assert.equal(res.provider, "a");
  assert.deepEqual(a.calls, [1, 2, 3]);
});

test("permanent errors stop without trying other providers", async () => {
  const a = fake("a", ["permanent"]);
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter), entry("b", b.adapter)]);
  await assert.rejects(hub.send("r", { n: 1 }), PermanentFailureError);
  assert.equal(b.calls.length, 0);
});

test("reports every attempt when nobody can send", async () => {
  const a = fake("a", ["auth"]);
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter), entry("b", b.adapter, { perDay: 0 })]);
  const err = await hub.send("r", { n: 1 }).catch((e) => e);
  assert.ok(err instanceof NoProviderAvailableError);
  assert.deepEqual(
    err.attempts.map((x: { outcome: string }) => x.outcome),
    ["failed", "skipped_full"],
  );
});

test("capability filter skips providers that do not allow the request", async () => {
  const a = fake("a", [], { allowsMarketing: false });
  const b = fake("b", [], { allowsMarketing: true });
  const hub = makeHub([entry("a", a.adapter), entry("b", b.adapter)]);
  const res = await hub.send("r", { n: 1 }, { requires: { allowsMarketing: true } });
  assert.equal(res.provider, "b");
  assert.equal(a.calls.length, 0);
});

test("weighted strategy spreads calls by weight", async () => {
  const a = fake("a");
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter, {}, 3), entry("b", b.adapter, {}, 1)], "weighted");
  const counts: Record<string, number> = { a: 0, b: 0 };
  for (let i = 0; i < 8; i++) counts[(await hub.send("r", { n: 1 })).provider]++;
  assert.deepEqual(counts, { a: 6, b: 2 });
});

test("least-used strategy picks the provider with the most free quota", async () => {
  const a = fake("a");
  const b = fake("b");
  const hub = makeHub([entry("a", a.adapter, { perDay: 10 }), entry("b", b.adapter, { perDay: 100 })], "least-used");
  const order: string[] = [];
  for (let i = 0; i < 3; i++) order.push((await hub.send("r", { n: 5 })).provider);
  assert.deepEqual(order, ["a", "b", "b"]);
});
