import { DatabaseSync } from "node:sqlite";
import type { Limits, Strategy } from "./types.ts";

export interface PanelRouteRow {
  name: string;
  kind: string;
  strategy: Strategy;
  maxAttempts: number;
}

export interface PanelProviderRow {
  name: string;
  route: string;
  use: string;
  limits: Limits;
  weight: number;
  capabilities: Record<string, boolean> | null;
  /** Provider options, encrypted with SecretBox. */
  options: string;
}

/**
 * Routes, providers and settings changed on the dashboard, kept in the same SQLite file as
 * the quota counters (in tables of their own).
 */
export class PanelStore {
  #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS panel_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS panel_routes (
        name TEXT PRIMARY KEY, kind TEXT NOT NULL, strategy TEXT NOT NULL, max_attempts INTEGER NOT NULL,
        created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS panel_providers (
        name TEXT PRIMARY KEY, route TEXT NOT NULL, use TEXT NOT NULL, limits TEXT NOT NULL, weight REAL NOT NULL,
        capabilities TEXT, options TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS panel_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  meta(key: string): string | undefined {
    return (this.#db.prepare("SELECT value FROM panel_meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  }

  setMeta(key: string, value: string): void {
    this.#db.prepare("INSERT INTO panel_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  routes(): PanelRouteRow[] {
    return (this.#db.prepare("SELECT name, kind, strategy, max_attempts FROM panel_routes ORDER BY created_at, name").all() as any[]).map((r) => ({
      name: r.name,
      kind: r.kind,
      strategy: r.strategy,
      maxAttempts: Number(r.max_attempts),
    }));
  }

  providers(): PanelProviderRow[] {
    return (this.#db.prepare("SELECT * FROM panel_providers ORDER BY created_at, name").all() as any[]).map((r) => ({
      name: r.name,
      route: r.route,
      use: r.use,
      limits: JSON.parse(r.limits),
      weight: Number(r.weight),
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
      options: r.options,
    }));
  }

  settings(): Map<string, unknown> {
    const rows = this.#db.prepare("SELECT key, value FROM panel_settings").all() as { key: string; value: string }[];
    return new Map(rows.map((r) => [r.key, JSON.parse(r.value)]));
  }

  putRoute(r: PanelRouteRow): void {
    this.#db
      .prepare(
        `INSERT INTO panel_routes (name, kind, strategy, max_attempts, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, strategy = excluded.strategy, max_attempts = excluded.max_attempts`,
      )
      .run(r.name, r.kind, r.strategy, r.maxAttempts, Date.now());
  }

  deleteRoute(name: string): void {
    this.#db.prepare("DELETE FROM panel_routes WHERE name = ?").run(name);
  }

  putProvider(p: PanelProviderRow): void {
    this.#db
      .prepare(
        `INSERT INTO panel_providers (name, route, use, limits, weight, capabilities, options, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET route = excluded.route, use = excluded.use, limits = excluded.limits, weight = excluded.weight,
           capabilities = excluded.capabilities, options = excluded.options`,
      )
      .run(p.name, p.route, p.use, JSON.stringify(p.limits), p.weight, p.capabilities ? JSON.stringify(p.capabilities) : null, p.options, Date.now());
  }

  deleteProvider(name: string): void {
    this.#db.prepare("DELETE FROM panel_providers WHERE name = ?").run(name);
  }

  /** Stores a setting; undefined removes it. */
  setSetting(key: string, value: unknown): void {
    if (value === undefined) this.#db.prepare("DELETE FROM panel_settings WHERE key = ?").run(key);
    else {
      this.#db
        .prepare("INSERT INTO panel_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(key, JSON.stringify(value));
    }
  }

  transaction<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (err) {
      this.#db.exec("ROLLBACK");
      throw err;
    }
  }

  close(): void {
    if (this.#db.isOpen) this.#db.close();
  }
}
