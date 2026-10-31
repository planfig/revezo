import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Attempt } from "./types.ts";

export interface HubEvent extends Attempt {
  /** Grows by one per event, so clients can ask only for what is new (?since=id). */
  id: number;
  ts: string;
  route: string;
  /** Name of the app key that made the call, when it was not the main key. */
  app?: string;
}

const KEEP_ON_DISK = 5000;

/**
 * Keeps the latest attempts for the dashboard. Holds no addresses or content. With a path
 * they are also written to SQLite, so the history survives a restart.
 */
export class EventLog {
  #items: HubEvent[] = [];
  #max: number;
  #lastId = 0;
  #db?: DatabaseSync;
  #insert?: StatementSync;
  #prune?: StatementSync;

  constructor(max = 200, path?: string) {
    this.#max = max;
    if (!path) return;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY, ts TEXT NOT NULL, route TEXT NOT NULL, provider TEXT NOT NULL,
        outcome TEXT NOT NULL, kind TEXT, message TEXT, app TEXT);
    `);
    this.#insert = this.#db.prepare("INSERT INTO events (id, ts, route, provider, outcome, kind, message, app) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    this.#prune = this.#db.prepare("DELETE FROM events WHERE id <= ?");
    const rows = this.#db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(max) as Record<string, any>[];
    this.#items = rows.reverse().map((r) => {
      const e: HubEvent = { id: Number(r.id), ts: r.ts, route: r.route, provider: r.provider, outcome: r.outcome };
      if (r.kind) e.kind = r.kind;
      if (r.message) e.message = r.message;
      if (r.app) e.app = r.app;
      return e;
    });
    this.#lastId = this.#items.at(-1)?.id ?? 0;
  }

  add(route: string, attempt: Attempt, now = new Date(), app?: string): void {
    const event: HubEvent = { id: ++this.#lastId, ts: now.toISOString(), route, ...attempt };
    if (app) event.app = app;
    this.#items.push(event);
    if (this.#items.length > this.#max) this.#items.splice(0, this.#items.length - this.#max);
    if (this.#insert) {
      try {
        this.#insert.run(event.id, event.ts, route, attempt.provider, attempt.outcome, attempt.kind ?? null, attempt.message ?? null, app ?? null);
        if (event.id % 100 === 0) this.#prune!.run(event.id - KEEP_ON_DISK);
      } catch {
        // The history is a convenience: a full or locked disk must not stop sending.
      }
    }
  }

  /** Id of the newest event, 0 when there is none. */
  get lastId(): number {
    return this.#lastId;
  }

  /** Newest first. With `since`, only events newer than that id. */
  list(limit = 50, since?: number): HubEvent[] {
    const items = since === undefined ? this.#items : this.#items.filter((e) => e.id > since);
    return items.slice(-limit).reverse();
  }

  close(): void {
    if (this.#db?.isOpen) this.#db.close();
  }
}
