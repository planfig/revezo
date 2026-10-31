import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bucketKey, MemoryQuotaStore, nextReset, SqliteQuotaStore } from "../src/core/quota.ts";

test("bucket keys follow the configured timezone", () => {
  const t = new Date("2026-10-31T23:30:00Z");
  assert.equal(bucketKey("day", t, "UTC"), "2026-10-31");
  assert.equal(bucketKey("day", t, "Europe/Lisbon"), "2026-10-31"); // UTC+0 in winter
  assert.equal(bucketKey("day", t, "Europe/Paris"), "2026-11-01");
  assert.equal(bucketKey("month", t, "Europe/Paris"), "2026-11");
});

test("nextReset finds the start of the next period", () => {
  const t = new Date("2026-10-31T10:15:30Z");
  assert.equal(nextReset("day", t, "UTC").toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(nextReset("month", t, "UTC").toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(nextReset("hour", t, "UTC").toISOString(), "2026-10-31T11:00:00.000Z");
});

test("reservations respect every limited window and can be released", async () => {
  const store = new MemoryQuotaStore();
  const now = new Date("2026-10-31T10:00:00Z");
  const limits = { perDay: 3, perMonth: 10 };
  const a = await store.tryReserve("p", limits, 2, now, "UTC");
  assert.ok(a);
  assert.equal(await store.tryReserve("p", limits, 2, now, "UTC"), null);
  await store.release(a);
  assert.ok(await store.tryReserve("p", limits, 3, now, "UTC"));
  const tomorrow = new Date("2026-11-01T10:00:00Z");
  assert.ok(await store.tryReserve("p", limits, 3, tomorrow, "UTC"), "daily counter resets");
  assert.deepEqual((await store.usage("p", tomorrow, "UTC")).month, 3);
});

test("SQLite store keeps counters and blocks across reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "revezo-"));
  const path = join(dir, "q.db");
  const now = new Date("2026-10-31T10:00:00Z");
  try {
    const first = new SqliteQuotaStore(path);
    await first.tryReserve("brevo", { perDay: 300 }, 299, now, "UTC");
    await first.block("mailjet", new Date("2026-11-01T00:00:00Z"), "quota");
    first.close();
    const second = new SqliteQuotaStore(path);
    assert.equal((await second.usage("brevo", now, "UTC")).day, 299);
    assert.equal(await second.tryReserve("brevo", { perDay: 300 }, 2, now, "UTC"), null);
    assert.equal((await second.blocked("mailjet", now))?.reason, "quota");
    assert.equal(await second.blocked("mailjet", new Date("2026-11-01T00:00:01Z")), null);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
