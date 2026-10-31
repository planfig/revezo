import type { CredentialStore } from "./auth.ts";
import { createHash, randomBytes } from "node:crypto";
import { ConfigError } from "./core/errors.ts";
import type { Hub } from "./core/hub.ts";
import { PanelStore, type AppKeyRow } from "./core/panel-store.ts";
import { getPlugin, listPlugins, type Plugin, type PluginContext } from "./core/registry.ts";
import { MIN_SECRETS_KEY_LENGTH, SecretBox } from "./core/secrets.ts";
import type { Adapter, Limits, Route, Source, Strategy } from "./core/types.ts";

/** Why the dashboard cannot change anything. */
export type ReadOnlyReason = "memory_storage" | "no_secrets_key" | "no_api_key";

/** A refused management action. Messages never contain option values. */
export class ManageError extends Error {
  status: 400 | 403 | 404 | 409;
  code: string;

  constructor(status: ManageError["status"], code: string, message: string) {
    super(message);
    this.name = "ManageError";
    this.status = status;
    this.code = code;
  }
}

export interface ManagerOptions {
  hub: Hub;
  ctx?: PluginContext;
  /** SQLite file of the quota counters (storage.sqlite). Without it the dashboard is read only. */
  storagePath?: string;
  /** REVEZO_SECRETS_KEY. Without it the dashboard is read only. */
  secretsKey?: string;
  defaults?: Record<string, string>;
}

interface ProviderSpec {
  name: string;
  use: string;
  source: Source;
  limits: Limits;
  weight: number;
  capabilities: Record<string, boolean> | null;
  adapter: Adapter;
  /** Which secret options have a value. The values themselves stay inside the adapter. */
  secrets: Record<string, boolean>;
  /** Encrypted options, kept to rewrite the row when limits change. */
  sealed?: string;
}

interface RouteSpec {
  name: string;
  kind: string;
  strategy: Strategy;
  maxAttempts: number;
  source: Source;
  cacheSeconds: number;
  providers: ProviderSpec[];
}

export const STRATEGIES: Strategy[] = ["priority", "weighted", "least-used"];
export const LIMIT_KEYS: (keyof Limits)[] = ["perMinute", "perHour", "perDay", "perMonth"];
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/;
const CAPABILITY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const MAX_OPTION_CHARS = 1000;
const MAX_LIMIT = 1_000_000_000;
const MAX_ROUTES = 50;
const MAX_PROVIDERS = 100;
const MAX_APP_KEYS = 50;
const KEY_CHECK = "revezo-secrets-check";

/**
 * Keeps the hub's routes in line with the config file plus what was changed on the dashboard.
 * Every change is saved first, then the hub gets a fresh set of routes (see Hub.setRoutes).
 */
export class Manager implements CredentialStore {
  #hub: Hub;
  #memoryCredentials?: { user: string; hash: string };
  #appKeys = new Map<string, AppKeyRow>(); // by hash
  #ctx: PluginContext;
  #routes = new Map<string, RouteSpec>();
  #settings = new Map<string, unknown>();
  #store?: PanelStore;
  #box?: SecretBox;
  #defaults: Record<string, string>;
  readonly readOnlyReason?: ReadOnlyReason;
  /** Problems found while loading saved providers, shown on the dashboard. */
  readonly warnings: string[] = [];

  constructor(opts: ManagerOptions) {
    this.#hub = opts.hub;
    this.#ctx = opts.ctx ?? { fetch };
    this.#defaults = opts.defaults ?? {};
    for (const r of opts.hub.routes()) {
      this.#routes.set(r.name, {
        name: r.name,
        kind: r.kind,
        strategy: r.strategy,
        maxAttempts: r.maxAttempts,
        source: "file",
        cacheSeconds: r.cacheSeconds ?? 0,
        providers: r.providers.map((p) => ({
          name: p.name,
          use: p.adapter.id,
          source: "file",
          limits: p.limits,
          weight: p.weight,
          capabilities: null,
          adapter: p.adapter,
          secrets: {},
        })),
      });
    }

    if (!opts.storagePath) {
      this.readOnlyReason = "memory_storage";
    } else {
      this.#store = new PanelStore(opts.storagePath);
      try {
        this.#settings = this.#store.settings();
        if (!opts.secretsKey) this.readOnlyReason = "no_secrets_key";
        else {
          if (opts.secretsKey.length < MIN_SECRETS_KEY_LENGTH) {
            throw new ConfigError(`REVEZO_SECRETS_KEY must have at least ${MIN_SECRETS_KEY_LENGTH} characters.`);
          }
          this.#box = this.#openBox(this.#store, opts.secretsKey);
        }
        this.#loadSaved(this.#store);
        for (const k of this.#store.appKeys()) this.#appKeys.set(k.hash, k);
      } catch (err) {
        this.#store.close();
        throw err;
      }
    }
    this.#apply();
  }

  get writable(): boolean {
    return this.readOnlyReason === undefined;
  }

  close(): void {
    this.#store?.close();
  }

  /** The dashboard login, in the SQLite file when there is one (kept in memory otherwise). */
  getCredentials(): { user: string; hash: string } | undefined {
    if (!this.#store) return this.#memoryCredentials;
    const user = this.#store.meta("admin_user");
    const hash = this.#store.meta("admin_hash");
    return user && hash ? { user, hash } : undefined;
  }

  setCredentials(user: string, hash: string): void {
    if (!this.#store) {
      this.#memoryCredentials = { user, hash };
      return;
    }
    this.#store.transaction(() => {
      this.#store!.setMeta("admin_user", user);
      this.#store!.setMeta("admin_hash", hash);
    });
  }

  /** Everything the dashboard shows, with live usage. Never includes option values. */
  async state() {
    const status = new Map((await this.#hub.status()).map((r) => [r.route, r]));
    return {
      writable: this.writable,
      reason: this.readOnlyReason ?? null,
      appKeys: await Promise.all(
        [...this.#appKeys.values()].map(async (k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          perDay: k.perDay,
          createdAt: new Date(k.createdAt).toISOString(),
          usage: await this.#hub.usageOf(appCounter(k.id)),
        })),
      ),
      warnings: this.warnings,
      plugins: listPlugins()
        .filter((p) => p.fields)
        .map((p) => ({
          kind: p.kind,
          id: p.id,
          label: p.label ?? p.id,
          oneAccountPerRoute: p.oneAccountPerRoute,
          fields: p.fields,
          suggestedLimits: p.suggestedLimits ?? {},
          defaultCapabilities: p.defaultCapabilities ?? {},
        })),
      routes: [...this.#routes.values()].map((spec) => {
        const live = status.get(spec.name);
        return {
          ...live,
          route: spec.name,
          kind: spec.kind,
          source: spec.source,
          isDefault: this.#defaults[spec.kind] === spec.name,
          providers: (live?.providers ?? []).map((p) => ({ ...p, secrets: this.#provider(p.name)?.spec.secrets ?? {} })),
        };
      }),
    };
  }

  addRoute(input: unknown): void {
    this.#assertWritable();
    const body = object(input, ["name", "kind", "strategy"]);
    const name = validName(body.name, "route");
    if (this.#routes.has(name)) throw new ManageError(409, "duplicate_name", `A route called "${name}" already exists`);
    if (this.#routes.size >= MAX_ROUTES) throw new ManageError(409, "too_many", `At most ${MAX_ROUTES} routes`);
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!listPlugins().some((p) => p.kind === kind)) throw new ManageError(400, "unknown_kind", "No provider type serves this kind");
    const strategy = validStrategy(body.strategy ?? "priority");
    const row = { name, kind, strategy, maxAttempts: 3 };
    this.#store!.transaction(() => {
      this.#store!.putRoute(row);
      this.#store!.setSetting(`strategy:${name}`, undefined);
    });
    this.#routes.set(name, { ...row, source: "panel", cacheSeconds: 0, providers: [] });
    this.#settings.delete(`strategy:${name}`);
    this.#apply();
  }

  /** Changes the strategy and/or the order of providers. Works on routes from the file too. */
  updateRoute(name: string, input: unknown): void {
    this.#assertWritable();
    const route = this.#route(name);
    const body = object(input, ["strategy", "order", "cacheSeconds"]);
    const changes: [string, unknown][] = [];
    if (body.cacheSeconds !== undefined) {
      const s = body.cacheSeconds;
      if (typeof s !== "number" || !Number.isInteger(s) || s < 0 || s > 86_400) {
        throw new ManageError(400, "invalid_cache", "cacheSeconds must be a whole number from 0 to 86400");
      }
      changes.push([`cache:${name}`, s]);
    }
    if (body.strategy !== undefined) changes.push([`strategy:${name}`, validStrategy(body.strategy)]);
    if (body.order !== undefined) {
      const names = route.providers.map((p) => p.name);
      const order = body.order;
      if (!Array.isArray(order) || order.length !== names.length || new Set(order).size !== names.length || !order.every((n) => names.includes(n))) {
        throw new ManageError(400, "invalid_order", "order must list every provider of the route exactly once");
      }
      changes.push([`order:${name}`, order]);
    }
    this.#saveSettings(changes);
  }

  /** Creates a key for one app. The key is returned only here; only its hash is stored. */
  createAppKey(input: unknown): { id: string; name: string; key: string } {
    this.#assertWritable();
    const body = object(input, ["name", "perDay"]);
    const name = validName(body.name, "key");
    const keys = [...this.#appKeys.values()];
    if (keys.some((k) => k.name === name)) throw new ManageError(409, "duplicate_name", `A key called "${name}" already exists`);
    if (keys.length >= MAX_APP_KEYS) throw new ManageError(409, "too_many", `At most ${MAX_APP_KEYS} app keys`);
    let perDay: number | null = null;
    if (body.perDay !== undefined && body.perDay !== null) {
      const v = body.perDay;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_LIMIT) throw new ManageError(400, "invalid_limits", `perDay must be a whole number from 1 to ${MAX_LIMIT}`);
      perDay = v;
    }
    const key = `rvz_${randomBytes(24).toString("base64url")}`;
    const row: AppKeyRow = { id: randomBytes(8).toString("hex"), name, hash: hashKey(key), prefix: key.slice(0, 10), perDay, createdAt: Date.now() };
    this.#store!.putAppKey(row);
    this.#appKeys.set(row.hash, row);
    return { id: row.id, name, key };
  }

  removeAppKey(id: string): void {
    this.#assertWritable();
    const row = [...this.#appKeys.values()].find((k) => k.id === id) ?? notFound("key", id);
    this.#store!.deleteAppKey(id);
    this.#appKeys.delete(row.hash);
  }

  /** The app a key belongs to, or undefined. */
  findAppKey(key: string): { id: string; name: string; perDay: number | null } | undefined {
    if (!key.startsWith("rvz_")) return undefined;
    const row = this.#appKeys.get(hashKey(key));
    return row && { id: row.id, name: row.name, perDay: row.perDay };
  }

  removeRoute(name: string): void {
    this.#assertWritable();
    const route = this.#route(name);
    if (route.source === "file") throw new ManageError(403, "from_file", "Routes from the config file can only be removed there");
    if (route.providers.length) throw new ManageError(409, "not_empty", "Remove the route's providers first");
    this.#store!.transaction(() => {
      this.#store!.deleteRoute(name);
      this.#store!.setSetting(`strategy:${name}`, undefined);
      this.#store!.setSetting(`order:${name}`, undefined);
      this.#store!.setSetting(`cache:${name}`, undefined);
    });
    this.#routes.delete(name);
    this.#settings.delete(`cache:${name}`);
    this.#settings.delete(`strategy:${name}`);
    this.#settings.delete(`order:${name}`);
    this.#apply();
  }

  addProvider(input: unknown): void {
    this.#assertWritable();
    const body = object(input, ["route", "use", "name", "options", "limits", "weight", "capabilities"]);
    const route = this.#route(typeof body.route === "string" ? body.route : "");
    const use = typeof body.use === "string" ? body.use : "";
    let plugin: Plugin;
    try {
      plugin = getPlugin(route.kind, use);
    } catch {
      throw new ManageError(400, "unknown_type", `"${use.slice(0, 40)}" is not a ${route.kind} provider type`);
    }
    if (!plugin.fields) throw new ManageError(400, "not_addable", `"${use}" can only be added in the config file`);
    const name = validName(body.name ?? use, "provider");
    if (this.#provider(name)) throw new ManageError(409, "duplicate_name", `A provider called "${name}" already exists`);
    if (plugin.oneAccountPerRoute && route.providers.some((p) => p.use === use)) {
      throw new ManageError(
        409,
        "duplicate_account",
        `This route already has a ${plugin.label ?? use} account. Using several accounts of one provider to add up free quotas breaks its terms.`,
      );
    }
    const count = [...this.#routes.values()].reduce((n, r) => n + r.providers.length, 0);
    if (count >= MAX_PROVIDERS) throw new ManageError(409, "too_many", `At most ${MAX_PROVIDERS} providers`);

    const options = validOptions(plugin, body.options);
    const limits = body.limits === undefined ? { ...plugin.suggestedLimits } : validLimits(body.limits);
    const weight = body.weight === undefined ? 1 : validWeight(body.weight);
    const capabilities = body.capabilities === undefined ? null : validCapabilities(body.capabilities);
    const adapter = this.#create(plugin, options, capabilities);
    const sealed = this.#box!.seal(JSON.stringify(options), aad(name));
    this.#store!.putProvider({ name, route: route.name, use, limits, weight, capabilities, options: sealed });
    const secrets = Object.fromEntries(plugin.fields.filter((f) => f.secret).map((f) => [f.name, options[f.name] !== undefined]));
    route.providers = [...route.providers, { name, use, source: "panel", limits, weight, capabilities, adapter, secrets, sealed }];
    this.#apply();
  }

  /** Limits, weight and capabilities can change on providers added here; any provider can be paused. */
  updateProvider(name: string, input: unknown): void {
    this.#assertWritable();
    const { route, spec } = this.#provider(name) ?? notFound("provider", name);
    const body = object(input, ["limits", "weight", "capabilities", "paused"]);
    const edits = body.limits !== undefined || body.weight !== undefined || body.capabilities !== undefined;
    if (edits && spec.source === "file") {
      throw new ManageError(403, "from_file", "Providers from the config file can only be paused or moved here; change their limits in the file");
    }
    if (body.paused !== undefined && typeof body.paused !== "boolean") throw new ManageError(400, "invalid_paused", "paused must be true or false");
    const next: ProviderSpec = { ...spec };
    if (body.limits !== undefined) next.limits = validLimits(body.limits);
    if (body.weight !== undefined) next.weight = validWeight(body.weight);
    if (body.capabilities !== undefined) {
      next.capabilities = body.capabilities === null ? null : validCapabilities(body.capabilities);
      next.adapter = withCapabilities(spec.adapter, next.capabilities, getPlugin(route.kind, spec.use));
    }
    this.#store!.transaction(() => {
      if (edits) {
        this.#store!.putProvider({ name, route: route.name, use: next.use, limits: next.limits, weight: next.weight, capabilities: next.capabilities, options: next.sealed! });
      }
      if (body.paused !== undefined) this.#store!.setSetting(`paused:${name}`, body.paused ? true : undefined);
    });
    route.providers = route.providers.map((p) => (p === spec ? next : p));
    if (body.paused === true) this.#settings.set(`paused:${name}`, true);
    if (body.paused === false) this.#settings.delete(`paused:${name}`);
    this.#apply();
  }

  removeProvider(name: string): void {
    this.#assertWritable();
    const { route, spec } = this.#provider(name) ?? notFound("provider", name);
    if (spec.source === "file") throw new ManageError(403, "from_file", "Providers from the config file can only be removed there");
    this.#store!.transaction(() => {
      this.#store!.deleteProvider(name);
      this.#store!.setSetting(`paused:${name}`, undefined);
    });
    route.providers = route.providers.filter((p) => p !== spec);
    this.#settings.delete(`paused:${name}`);
    this.#apply();
  }

  #saveSettings(changes: [string, unknown][]) {
    this.#store!.transaction(() => {
      for (const [k, v] of changes) this.#store!.setSetting(k, v);
    });
    for (const [k, v] of changes) this.#settings.set(k, v);
    this.#apply();
  }

  /** Builds new route objects from the specs and settings and hands them to the hub. */
  #apply() {
    const routes: Route[] = [...this.#routes.values()].map((spec) => {
      const order = this.#settings.get(`order:${spec.name}`);
      const position = (n: string) => {
        const i = Array.isArray(order) ? order.indexOf(n) : -1;
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      const strategy = this.#settings.get(`strategy:${spec.name}`);
      return {
        name: spec.name,
        kind: spec.kind,
        strategy: STRATEGIES.includes(strategy as Strategy) ? (strategy as Strategy) : spec.strategy,
        maxAttempts: spec.maxAttempts,
        source: spec.source,
        cacheSeconds: typeof this.#settings.get(`cache:${spec.name}`) === "number" ? (this.#settings.get(`cache:${spec.name}`) as number) : spec.cacheSeconds,
        providers: spec.providers
          .map((p, i) => ({ p, i }))
          .sort((a, b) => position(a.p.name) - position(b.p.name) || a.i - b.i)
          .map(({ p }) => ({
            name: p.name,
            adapter: p.adapter,
            limits: p.limits,
            weight: p.weight,
            source: p.source,
            paused: this.#settings.get(`paused:${p.name}`) === true,
          })),
      };
    });
    this.#hub.setRoutes(routes);
  }

  #openBox(store: PanelStore, secretsKey: string): SecretBox {
    let salt = store.meta("salt");
    if (!salt) {
      salt = SecretBox.newSalt().toString("base64");
      store.setMeta("salt", salt);
    }
    const box = new SecretBox(secretsKey, Buffer.from(salt, "base64"));
    const check = store.meta("check");
    if (!check) store.setMeta("check", box.seal(KEY_CHECK, "check"));
    else {
      let ok = false;
      try {
        ok = box.open(check, "check") === KEY_CHECK;
      } catch {}
      if (!ok) throw new ConfigError("REVEZO_SECRETS_KEY is not the key used to save the dashboard's providers. Use the old key.");
    }
    return box;
  }

  #loadSaved(store: PanelStore) {
    for (const r of store.routes()) {
      if (this.#routes.has(r.name)) {
        this.warnings.push(`Route "${r.name}" saved on the dashboard is now also in the config file; the file wins.`);
        continue;
      }
      this.#routes.set(r.name, { ...r, source: "panel", cacheSeconds: 0, providers: [] });
    }
    const saved = store.providers();
    if (saved.length && !this.#box) {
      this.warnings.push(`${saved.length} provider(s) added on the dashboard are not loaded: REVEZO_SECRETS_KEY is not set.`);
      return;
    }
    for (const row of saved) {
      const route = this.#routes.get(row.route);
      if (!route) {
        this.warnings.push(`Provider "${row.name}" belongs to route "${row.route}", which no longer exists.`);
        continue;
      }
      if (this.#provider(row.name)) {
        this.warnings.push(`Provider "${row.name}" saved on the dashboard is now also in the config file; the file wins.`);
        continue;
      }
      try {
        const plugin = getPlugin(route.kind, row.use);
        const options = JSON.parse(this.#box!.open(row.options, aad(row.name))) as Record<string, unknown>;
        const secrets = Object.fromEntries((plugin.fields ?? []).filter((f) => f.secret).map((f) => [f.name, options[f.name] !== undefined]));
        const adapter = this.#create(plugin, options, row.capabilities);
        route.providers.push({
          name: row.name,
          use: row.use,
          source: "panel",
          limits: row.limits,
          weight: row.weight,
          capabilities: row.capabilities,
          adapter,
          secrets,
          sealed: row.options,
        });
      } catch (err) {
        const why = err instanceof ConfigError ? err.message : "its saved options could not be read";
        this.warnings.push(`Provider "${row.name}" was not loaded: ${why}`);
      }
    }
  }

  #create(plugin: Plugin, options: Record<string, unknown>, capabilities: Record<string, boolean> | null): Adapter {
    let adapter: Adapter;
    try {
      adapter = plugin.create(options, this.#ctx);
    } catch (err) {
      throw new ManageError(400, "invalid_options", err instanceof ConfigError ? err.message : "The provider refused these options");
    }
    return withCapabilities(adapter, capabilities, plugin);
  }

  #assertWritable() {
    if (this.readOnlyReason) throw new ManageError(409, "read_only", `The dashboard is read only (${this.readOnlyReason})`);
  }

  #route(name: string): RouteSpec {
    return this.#routes.get(name) ?? notFound("route", name);
  }

  #provider(name: string): { route: RouteSpec; spec: ProviderSpec } | undefined {
    for (const route of this.#routes.values()) {
      const spec = route.providers.find((p) => p.name === name);
      if (spec) return { route, spec };
    }
    return undefined;
  }
}

const aad = (name: string) => `provider:${name}`;
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
/** Quota counter name of an app key. */
export const appCounter = (id: string) => `app:${id}`;

function notFound(what: string, name: string): never {
  throw new ManageError(404, `unknown_${what}`, `No ${what} called "${String(name).slice(0, 48)}"`);
}

function withCapabilities(adapter: Adapter, capabilities: Record<string, boolean> | null, plugin: Plugin): Adapter {
  const base = { ...(plugin.defaultCapabilities ?? adapter.capabilities) };
  return { ...adapter, capabilities: capabilities ? { ...base, ...capabilities } : base };
}

function object(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ManageError(400, "invalid_body", "Body must be a JSON object");
  const extra = Object.keys(input).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ManageError(400, "unknown_field", `Unknown field "${extra[0].slice(0, 40)}"`);
  return input as Record<string, unknown>;
}

function validName(value: unknown, what: string): string {
  if (typeof value !== "string" || !NAME_RE.test(value)) {
    throw new ManageError(400, "invalid_name", `The ${what} name must be 1–48 letters, digits, "-", "_" or "." and start with a letter or digit`);
  }
  return value;
}

function validStrategy(value: unknown): Strategy {
  if (!STRATEGIES.includes(value as Strategy)) throw new ManageError(400, "invalid_strategy", `strategy must be one of ${STRATEGIES.join(", ")}`);
  return value as Strategy;
}

function validLimits(value: unknown): Limits {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ManageError(400, "invalid_limits", "limits must be an object");
  const limits: Limits = {};
  for (const [k, v] of Object.entries(value)) {
    if (!LIMIT_KEYS.includes(k as keyof Limits)) throw new ManageError(400, "invalid_limits", `Unknown limit "${k.slice(0, 20)}"; use ${LIMIT_KEYS.join(", ")}`);
    if (v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_LIMIT) {
      throw new ManageError(400, "invalid_limits", `${k} must be a whole number from 0 to ${MAX_LIMIT}`);
    }
    limits[k as keyof Limits] = v;
  }
  return limits;
}

function validWeight(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1000) {
    throw new ManageError(400, "invalid_weight", "weight must be a number above 0 and up to 1000");
  }
  return value;
}

function validCapabilities(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ManageError(400, "invalid_capabilities", "capabilities must be an object");
  const entries = Object.entries(value);
  if (entries.length > 8 || entries.some(([k, v]) => !CAPABILITY_RE.test(k) || typeof v !== "boolean")) {
    throw new ManageError(400, "invalid_capabilities", "capabilities must be up to 8 true/false flags");
  }
  return Object.fromEntries(entries) as Record<string, boolean>;
}

/** Checks options against the plugin's fields: known names, right types, required ones present. */
function validOptions(plugin: Plugin, value: unknown): Record<string, unknown> {
  if (value === undefined) value = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ManageError(400, "invalid_options", "options must be an object");
  const fields = plugin.fields ?? [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const field = fields.find((f) => f.name === k);
    if (!field) throw new ManageError(400, "invalid_options", `Unknown option "${k.slice(0, 40)}"`);
    if (v === null || v === "") continue;
    if (field.type === "string") {
      if (typeof v !== "string" || v.length > MAX_OPTION_CHARS || CONTROL_RE.test(v)) {
        throw new ManageError(400, "invalid_options", `${field.label} must be one line of text up to ${MAX_OPTION_CHARS} characters`);
      }
      if (v.trim()) out[k] = v.trim();
    } else if (field.type === "number") {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > MAX_LIMIT) throw new ManageError(400, "invalid_options", `${field.label} must be a number`);
      out[k] = n;
    } else {
      if (typeof v !== "boolean") throw new ManageError(400, "invalid_options", `${field.label} must be true or false`);
      out[k] = v;
    }
  }
  const missing = fields.find((f) => f.required && out[f.name] === undefined);
  if (missing) throw new ManageError(400, "missing_option", `${missing.label} is required`);
  return out;
}
