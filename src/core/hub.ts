import { NoProviderAvailableError, PermanentFailureError, ProviderError } from "./errors.ts";
import { limitFor, nextReset, type QuotaStore } from "./quota.ts";
import { WINDOWS, type Attempt, type ErrorKind, type Limits, type ProviderEntry, type Route, type SendResult, type Usage } from "./types.ts";

export interface HubOptions {
  store: QuotaStore;
  timeZone?: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Called after every attempt; never receives message content. */
  onAttempt?: (route: string, attempt: Attempt, app?: string) => void;
}

export interface SendOptions {
  /** Only use providers whose capabilities match all of these, e.g. { allowsMarketing: true }. */
  requires?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Name of the app key making the call, passed on to onAttempt. */
  app?: string;
}

const RATE_LIMIT_PAUSE_MS = 60_000;
const AUTH_PAUSE_MS = 3_600_000;

export class Hub {
  #routes = new Map<string, Route>();
  #store: QuotaStore;
  #timeZone: string;
  #now: () => Date;
  #sleep: (ms: number) => Promise<void>;
  #onAttempt?: HubOptions["onAttempt"];
  #rrState = new Map<string, Map<string, number>>();

  constructor(opts: HubOptions) {
    this.#store = opts.store;
    this.#timeZone = opts.timeZone ?? "UTC";
    this.#now = opts.now ?? (() => new Date());
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#onAttempt = opts.onAttempt;
  }

  addRoute(route: Route): this {
    this.#routes.set(route.name, route);
    return this;
  }

  /**
   * Replaces every route at once. The next call uses the new ones; calls already running
   * finish with the route they started with, because routes are never changed in place.
   */
  setRoutes(routes: Route[]): void {
    this.#routes = new Map(routes.map((r) => [r.name, r]));
    for (const name of this.#rrState.keys()) if (!this.#routes.has(name)) this.#rrState.delete(name);
  }

  route(name: string): Route | undefined {
    return this.#routes.get(name);
  }

  routes(): Route[] {
    return [...this.#routes.values()];
  }

  /** Sends through the first suitable provider of the route, failing over as needed. */
  async send<Req, Res>(routeName: string, req: Req, opts: SendOptions = {}): Promise<SendResult<Res>> {
    const route = this.#routes.get(routeName);
    if (!route) throw new Error(`Unknown route "${routeName}"`);
    const attempts: Attempt[] = [];
    const record = (a: Attempt) => {
      attempts.push(a);
      this.#onAttempt?.(route.name, a, opts.app);
    };

    for (const entry of await this.#order(route)) {
      if (entry.paused) {
        record({ provider: entry.name, outcome: "skipped_paused" });
        continue;
      }
      if (!matches(entry.adapter.capabilities, opts.requires)) {
        record({ provider: entry.name, outcome: "skipped_capability" });
        continue;
      }
      const now = this.#now();
      const block = await this.#store.blocked(entry.name, now);
      if (block) {
        record({ provider: entry.name, outcome: "skipped_blocked", message: block.reason });
        continue;
      }
      const { amount } = entry.adapter.cost(req);
      const reservation = await this.#store.tryReserve(entry.name, entry.limits, amount, now, this.#timeZone);
      if (!reservation) {
        record({ provider: entry.name, outcome: "skipped_full" });
        continue;
      }

      for (let attempt = 1; ; attempt++) {
        try {
          const result = (await entry.adapter.send(req, { attempt, signal: opts.signal })) as Res;
          record({ provider: entry.name, outcome: "sent" });
          await this.#count(entry, result, now);
          return { route: route.name, provider: entry.name, result, attempts };
        } catch (err) {
          const kind = classify(entry, err);
          const message = shortMessage(err);
          record({ provider: entry.name, outcome: "failed", kind, message });
          if (kind === "temporary" && attempt < route.maxAttempts) {
            await this.#sleep(backoff(attempt));
            continue;
          }
          await this.#store.release(reservation);
          if (kind === "permanent") throw new PermanentFailureError(message, attempts);
          await this.#pause(entry, kind, err);
          break;
        }
      }
    }
    throw new NoProviderAvailableError(route.name, attempts);
  }

  /** Extra counters reported by the adapter, e.g. tokens used. Only counted, never limited. */
  async #count(entry: ProviderEntry, result: unknown, now: Date) {
    try {
      const meters = entry.adapter.meters?.(result) ?? {};
      for (const [unit, n] of Object.entries(meters)) {
        if (Number.isFinite(n) && n > 0) await this.#store.tryReserve(`${entry.name}#${unit}`, {}, n, now, this.#timeZone);
      }
    } catch {
      // Counting is informative; it must never fail a send that went through.
    }
  }

  /** Counts one use against a named counter with limits (e.g. an app key); false when full. */
  async reserve(name: string, limits: Limits, amount = 1): Promise<boolean> {
    return (await this.#store.tryReserve(name, limits, amount, this.#now(), this.#timeZone)) !== null;
  }

  usageOf(name: string): Promise<Usage> {
    return this.#store.usage(name, this.#now(), this.#timeZone);
  }

  /** Current usage, limits and blocks for every provider of every route. */
  async status() {
    const now = this.#now();
    return Promise.all(
      this.routes().map(async (route) => ({
        route: route.name,
        kind: route.kind,
        strategy: route.strategy,
        source: route.source ?? "file",
        cacheSeconds: route.cacheSeconds ?? 0,
        providers: await Promise.all(
          route.providers.map(async (p) => ({
            name: p.name,
            type: p.adapter.id,
            source: p.source ?? "file",
            paused: p.paused === true,
            weight: p.weight,
            capabilities: p.adapter.capabilities,
            limits: p.limits,
            usage: await this.#store.usage(p.name, now, this.#timeZone),
            meters: Object.fromEntries(
              await Promise.all((p.adapter.meterUnits ?? []).map(async (u) => [u, await this.#store.usage(`${p.name}#${u}`, now, this.#timeZone)])),
            ) as Record<string, Usage>,
            blocked: await this.#store.blocked(p.name, now),
          })),
        ),
      })),
    );
  }

  async #pause(entry: ProviderEntry, kind: ErrorKind, err: unknown) {
    const now = this.#now();
    const retryAfter = err instanceof ProviderError ? err.retryAfterMs : undefined;
    let until: Date;
    if (kind === "quota") {
      // Without better information, assume the daily quota is gone; if the monthly one
      // is configured and already used up by our own count, wait for the month instead.
      const usage = await this.#store.usage(entry.name, now, this.#timeZone);
      const monthFull = entry.limits.perMonth !== undefined && usage.month >= entry.limits.perMonth;
      until = retryAfter ? new Date(now.getTime() + retryAfter) : nextReset(monthFull ? "month" : "day", now, this.#timeZone);
    } else if (kind === "rate_limit") {
      until = new Date(now.getTime() + (retryAfter ?? RATE_LIMIT_PAUSE_MS));
    } else if (kind === "auth") {
      until = new Date(now.getTime() + AUTH_PAUSE_MS);
    } else {
      return; // temporary: no pause, the next request may try again
    }
    await this.#store.block(entry.name, until, kind);
  }

  async #order(route: Route): Promise<ProviderEntry[]> {
    // Paused providers go last, so they never win a weighted turn but still show in the attempts.
    const paused = route.providers.filter((p) => p.paused);
    return [...(await this.#orderActive(route, route.providers.filter((p) => !p.paused))), ...paused];
  }

  async #orderActive(route: Route, list: ProviderEntry[]): Promise<ProviderEntry[]> {
    if (route.strategy === "priority" || list.length < 2) return list;
    if (route.strategy === "least-used") {
      const now = this.#now();
      const scored = await Promise.all(
        list.map(async (p, i) => ({ p, i, used: fractionUsed(await this.#store.usage(p.name, now, this.#timeZone), p) })),
      );
      return scored.sort((a, b) => a.used - b.used || a.i - b.i).map((s) => s.p);
    }
    // weighted: smooth weighted round-robin picks the first, the rest follow by weight as fallbacks
    let state = this.#rrState.get(route.name);
    if (!state) this.#rrState.set(route.name, (state = new Map()));
    const total = list.reduce((s, p) => s + p.weight, 0);
    let best = list[0];
    for (const p of list) {
      state.set(p.name, (state.get(p.name) ?? 0) + p.weight);
      if (state.get(p.name)! > state.get(best.name)!) best = p;
    }
    state.set(best.name, state.get(best.name)! - total);
    return [best, ...list.filter((p) => p !== best).sort((a, b) => b.weight - a.weight)];
  }
}

function matches(capabilities: Record<string, unknown>, requires?: Record<string, unknown>): boolean {
  return !requires || Object.entries(requires).every(([k, v]) => capabilities[k] === v);
}

function classify(entry: ProviderEntry, err: unknown): ErrorKind {
  if (err instanceof ProviderError) return err.kind;
  try {
    return entry.adapter.classifyError(err);
  } catch {
    return "temporary";
  }
}

function fractionUsed(usage: Usage, p: ProviderEntry): number {
  let max = 0;
  for (const w of WINDOWS) {
    const limit = limitFor(p.limits, w);
    if (limit) max = Math.max(max, usage[w] / limit);
  }
  return max;
}

function backoff(attempt: number): number {
  return Math.min(10_000, 500 * 2 ** (attempt - 1));
}

/** Provider error text, shortened and with e-mail addresses and phone numbers removed (it ends up in logs). */
export function shortMessage(err: unknown): string {
  const text = (err instanceof Error ? err.message : String(err))
    .replace(/[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]");
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
