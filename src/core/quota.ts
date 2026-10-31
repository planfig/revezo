import { DatabaseSync } from "node:sqlite";
import { WINDOWS, type Limits, type Usage, type Window } from "./types.ts";

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateParts(now: Date, timeZone: string): Record<string, string> {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
}

/** Identifies the current counting period, e.g. "2026-10-31" for the day window. */
export function bucketKey(window: Window, now: Date, timeZone: string): string {
  const p = dateParts(now, timeZone);
  switch (window) {
    case "minute":
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    case "hour":
      return `${p.year}-${p.month}-${p.day}T${p.hour}`;
    case "day":
      return `${p.year}-${p.month}-${p.day}`;
    case "month":
      return `${p.year}-${p.month}`;
  }
}

/** When the counter for this window starts again (to within one second). */
export function nextReset(window: Window, now: Date, timeZone: string): Date {
  const start = bucketKey(window, now, timeZone);
  const step = { minute: 1_000, hour: 60_000, day: 900_000, month: 3_600_000 }[window];
  let lo = now.getTime();
  while (bucketKey(window, new Date(lo + step), timeZone) === start) lo += step;
  let hi = lo + step;
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (bucketKey(window, new Date(mid), timeZone) === start) lo = mid;
    else hi = mid;
  }
  // Period boundaries always fall on a whole minute, even in :30/:45 offset timezones.
  return new Date(Math.floor(hi / 60_000) * 60_000);
}

export function limitFor(limits: Limits, window: Window): number | undefined {
  return {
    minute: limits.perMinute,
    hour: limits.perHour,
    day: limits.perDay,
    month: limits.perMonth,
  }[window];
}

export interface Reservation {
  provider: string;
  keys: string[];
  amount: number;
}

export interface Block {
  until: Date;
  reason: string;
}

/** Counts usage per provider and time window. Async so it can be backed by remote stores later. */
export interface QuotaStore {
  /** Atomically checks every limited window and, if all have room, counts the amount. */
  tryReserve(provider: string, limits: Limits, amount: number, now: Date, timeZone: string): Promise<Reservation | null>;
  /** Gives back a reservation whose call did not go through. */
  release(reservation: Reservation): Promise<void>;
  usage(provider: string, now: Date, timeZone: string): Promise<Usage>;
  block(provider: string, until: Date, reason: string): Promise<void>;
  blocked(provider: string, now: Date): Promise<Block | null>;
}

/** Minimal storage the quota logic needs. Methods run inside transaction(). */
interface Kv {
  get(key: string): number;
  add(key: string, delta: number, now: number): void;
  getBlock(provider: string): { until: number; reason: string } | undefined;
  setBlock(provider: string, until: number, reason: string): void;
  transaction<T>(fn: () => T): T;
}

class KvQuotaStore implements QuotaStore {
  #kv: Kv;

  constructor(kv: Kv) {
    this.#kv = kv;
  }

  #keys(provider: string, now: Date, timeZone: string): [Window, string][] {
    return WINDOWS.map((w) => [w, `${provider}|${w}|${bucketKey(w, now, timeZone)}`]);
  }

  async tryReserve(provider: string, limits: Limits, amount: number, now: Date, timeZone: string) {
    const keys = this.#keys(provider, now, timeZone);
    return this.#kv.transaction(() => {
      for (const [w, key] of keys) {
        const limit = limitFor(limits, w);
        if (limit !== undefined && this.#kv.get(key) + amount > limit) return null;
      }
      for (const [, key] of keys) this.#kv.add(key, amount, now.getTime());
      return { provider, keys: keys.map(([, k]) => k), amount };
    });
  }

  async release(reservation: Reservation) {
    this.#kv.transaction(() => {
      for (const key of reservation.keys) {
        this.#kv.add(key, -Math.min(reservation.amount, this.#kv.get(key)), Date.now());
      }
    });
  }

  async usage(provider: string, now: Date, timeZone: string) {
    const out = {} as Usage;
    for (const [w, key] of this.#keys(provider, now, timeZone)) out[w] = this.#kv.get(key);
    return out;
  }

  async block(provider: string, until: Date, reason: string) {
    this.#kv.transaction(() => this.#kv.setBlock(provider, until.getTime(), reason));
  }

  async blocked(provider: string, now: Date) {
    const b = this.#kv.getBlock(provider);
    return b && b.until > now.getTime() ? { until: new Date(b.until), reason: b.reason } : null;
  }
}

/** Counters kept in memory: lost on restart. Good for tests and single short-lived processes. */
export class MemoryQuotaStore extends KvQuotaStore {
  constructor() {
    const counts = new Map<string, number>();
    const blocks = new Map<string, { until: number; reason: string }>();
    super({
      get: (key) => counts.get(key) ?? 0,
      add: (key, delta) => counts.set(key, (counts.get(key) ?? 0) + delta),
      getBlock: (p) => blocks.get(p),
      setBlock: (p, until, reason) => blocks.set(p, { until, reason }),
      transaction: (fn) => fn(),
    });
  }
}

const RETENTION_MS = 40 * 24 * 3_600_000;

/** Counters kept in a local SQLite file, safe across restarts and concurrent requests. */
export class SqliteQuotaStore extends KvQuotaStore {
  close: () => void;

  constructor(path: string) {
    const db = new DatabaseSync(path);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS usage (key TEXT PRIMARY KEY, amount REAL NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks (provider TEXT PRIMARY KEY, until INTEGER NOT NULL, reason TEXT NOT NULL);
    `);
    db.prepare("DELETE FROM usage WHERE updated_at < ?").run(Date.now() - RETENTION_MS);
    const get = db.prepare("SELECT amount FROM usage WHERE key = ?");
    const add = db.prepare(
      `INSERT INTO usage (key, amount, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET amount = amount + excluded.amount, updated_at = excluded.updated_at`,
    );
    const getBlock = db.prepare("SELECT until, reason FROM blocks WHERE provider = ?");
    const setBlock = db.prepare(
      `INSERT INTO blocks (provider, until, reason) VALUES (?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET until = excluded.until, reason = excluded.reason`,
    );
    super({
      get: (key) => Number((get.get(key) as { amount: number } | undefined)?.amount ?? 0),
      add: (key, delta, now) => void add.run(key, delta, now),
      getBlock: (p) => getBlock.get(p) as { until: number; reason: string } | undefined,
      setBlock: (p, until, reason) => void setBlock.run(p, until, reason),
      transaction: (fn) => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          db.exec("COMMIT");
          return result;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      },
    });
    this.close = () => db.close();
  }
}
