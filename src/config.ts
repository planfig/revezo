import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "yaml";
import { ConfigError } from "./core/errors.ts";
import { Hub, type HubOptions } from "./core/hub.ts";
import { MemoryQuotaStore, SqliteQuotaStore, type QuotaStore } from "./core/quota.ts";
import { getPlugin, listPlugins, type PluginContext } from "./core/registry.ts";
import type { Limits, ProviderEntry, Route, Strategy } from "./core/types.ts";

export interface RevezoConfig {
  server: { port: number; host: string };
  timezone: string;
  defaults: Record<string, string>;
  hub: Hub;
  /** SQLite file from storage.sqlite, also used for providers added on the dashboard. */
  storagePath?: string;
  pluginContext: PluginContext;
}

const STRATEGIES: Strategy[] = ["priority", "weighted", "least-used"];
const LIMIT_KEYS: (keyof Limits)[] = ["perMinute", "perHour", "perDay", "perMonth"];

/** Replaces ${NAME} with environment values. Errors name the variable, never a value. */
export function expandEnv(value: unknown, env: Record<string, string | undefined>, path = ""): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
      const v = env[name];
      if (v === undefined || v === "") throw new ConfigError(`Environment variable ${name} is not set (used at ${path || "root"})`);
      return v;
    });
  }
  if (Array.isArray(value)) return value.map((v, i) => expandEnv(v, env, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandEnv(v, env, path ? `${path}.${k}` : k)]));
  }
  return value;
}

export interface BuildOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  store?: QuotaStore;
  hubOptions?: Partial<HubOptions>;
}

export function loadConfigFile(path: string, opts: BuildOptions = {}): RevezoConfig {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ConfigError(`Config file not found: ${path}. Copy revezo.config.example.yaml to start.`);
  }
  return buildConfig(parse(text), opts);
}

export function buildConfig(raw: unknown, opts: BuildOptions = {}): RevezoConfig {
  if (!raw || typeof raw !== "object") throw new ConfigError("Config must be a YAML object");
  const cfg = raw as Record<string, any>;
  const env = opts.env ?? process.env;
  const ctx: PluginContext = { fetch: opts.fetch ?? fetch };
  const timezone = typeof cfg.timezone === "string" ? cfg.timezone : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new ConfigError(`Unknown timezone "${timezone}"`);
  }

  const store = opts.store ?? makeStore(cfg.storage);
  const hub = new Hub({ store, timeZone: timezone, ...opts.hubOptions });

  // Routes may be empty: providers can be added on the dashboard instead.
  const routes = cfg.routes ?? {};
  if (typeof routes !== "object" || Array.isArray(routes)) throw new ConfigError("routes: must be an object of named routes");
  const usedNames = new Set<string>();
  for (const [routeName, r] of Object.entries<any>(routes)) {
    hub.addRoute(buildRoute(routeName, r, env, ctx, usedNames));
  }

  const defaults: Record<string, string> = { ...(cfg.defaults ?? {}) };
  for (const [kind, routeName] of Object.entries(defaults)) {
    if (hub.route(routeName)?.kind !== kind) throw new ConfigError(`defaults.${kind} points to "${routeName}", which is not a ${kind} route`);
  }
  const port = Number(env.PORT ?? cfg.server?.port ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError("server.port must be a number between 1 and 65535");
  // Local only by default; Docker sets HOST=0.0.0.0.
  const host = String(env.HOST ?? cfg.server?.host ?? "127.0.0.1");
  const storagePath = typeof cfg.storage?.sqlite === "string" ? cfg.storage.sqlite : undefined;
  return { server: { port, host }, timezone, defaults, hub, storagePath, pluginContext: ctx };
}

function buildRoute(
  routeName: string,
  r: any,
  env: Record<string, string | undefined>,
  ctx: PluginContext,
  usedNames: Set<string>,
): Route {
  const where = `routes.${routeName}`;
  if (!r || typeof r !== "object") throw new ConfigError(`${where} must be an object`);
  const kind = String(r.kind ?? "");
  if (!kind) throw new ConfigError(`${where}.kind is required (e.g. email)`);
  const strategy = (r.strategy ?? "priority") as Strategy;
  if (!STRATEGIES.includes(strategy)) throw new ConfigError(`${where}.strategy must be one of ${STRATEGIES.join(", ")}`);
  if (!listPlugins().some((p) => p.kind === kind)) throw new ConfigError(`${where}.kind "${kind}" has no provider types yet`);
  const list = r.providers ?? [];
  if (!Array.isArray(list)) throw new ConfigError(`${where}.providers must be a list (it may be empty)`);

  const seenTypes = new Set<string>();
  const providers: ProviderEntry[] = list.map((p: any, i: number) => {
    const at = `${where}.providers[${i}]`;
    const use = String(p?.use ?? "");
    if (!use) throw new ConfigError(`${at}.use is required`);
    const plugin = getPlugin(kind, use);
    if (plugin.oneAccountPerRoute && seenTypes.has(use)) {
      throw new ConfigError(
        `${at}: "${use}" is listed twice. Using several accounts of one provider to add up free quotas breaks most providers' terms.`,
      );
    }
    seenTypes.add(use);

    const name = String(p.name ?? use);
    if (usedNames.has(name)) throw new ConfigError(`${at}: provider name "${name}" is already used; give it a unique name:`);
    usedNames.add(name);

    const options = expandEnv(p.options ?? {}, env, `${at}.options`) as Record<string, unknown>;
    const created = plugin.create(options, ctx);
    const adapter = p.capabilities ? { ...created, capabilities: { ...created.capabilities, ...p.capabilities } } : created;
    return { name, adapter, limits: parseLimits(p.limits, at), weight: parseWeight(p.weight, at), source: "file" as const };
  });

  const maxAttempts = Number(r.maxAttempts ?? 3);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new ConfigError(`${where}.maxAttempts must be a whole number ≥ 1`);
  const cacheSeconds = Number(r.cacheSeconds ?? 0);
  if (!Number.isInteger(cacheSeconds) || cacheSeconds < 0 || cacheSeconds > 86_400) {
    throw new ConfigError(`${where}.cacheSeconds must be a whole number from 0 to 86400`);
  }
  return { name: routeName, kind, strategy, providers, maxAttempts, source: "file", cacheSeconds };
}

function parseLimits(raw: unknown, at: string): Limits {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object") throw new ConfigError(`${at}.limits must be an object`);
  const limits: Limits = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!LIMIT_KEYS.includes(k as keyof Limits)) throw new ConfigError(`${at}.limits.${k} is unknown; use ${LIMIT_KEYS.join(", ")}`);
    if (typeof v !== "number" || v < 0) throw new ConfigError(`${at}.limits.${k} must be a positive number`);
    limits[k as keyof Limits] = v;
  }
  return limits;
}

function parseWeight(raw: unknown, at: string): number {
  if (raw === undefined) return 1;
  if (typeof raw !== "number" || raw <= 0) throw new ConfigError(`${at}.weight must be a positive number`);
  return raw;
}

function makeStore(storage: any): QuotaStore {
  const path = storage?.sqlite;
  if (!path) return new MemoryQuotaStore();
  mkdirSync(dirname(path), { recursive: true });
  return new SqliteQuotaStore(path);
}
