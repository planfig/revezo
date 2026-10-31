/** How a provider failure should be handled by the router. */
export type ErrorKind =
  | "quota" // free quota used up: skip this provider until its counter resets
  | "rate_limit" // too many requests right now: skip for a short while
  | "temporary" // network or 5xx: retry, then move on
  | "permanent" // the request itself is bad (invalid address...): stop, do not try others
  | "auth"; // bad or revoked credentials: skip this provider

/** What one call consumes from a provider's quota, e.g. 3 e-mails or 1200 tokens. */
export interface Cost {
  unit: string;
  amount: number;
}

export interface SendContext {
  attempt: number;
  signal?: AbortSignal;
}

/** A plugin that talks to one provider of one kind of API. */
export interface Adapter<Req = unknown, Res = unknown> {
  /** Provider type, e.g. "brevo". */
  readonly id: string;
  /** API kind, e.g. "email", "llm", "social", "sms". */
  readonly kind: string;
  /** Free-form flags the router can filter on, e.g. { allowsMarketing: true }. */
  readonly capabilities: Record<string, unknown>;
  cost(req: Req): Cost;
  send(req: Req, ctx: SendContext): Promise<Res>;
  classifyError(err: unknown): ErrorKind;
  /** Extra counters per successful call, e.g. { tokens: 1234 }. Shown, not limited. */
  meters?(res: Res): Record<string, number>;
  /** Units meters() reports, so the dashboard can show them before the first call. */
  meterUnits?: string[];
}

export const WINDOWS = ["minute", "hour", "day", "month"] as const;
export type Window = (typeof WINDOWS)[number];

/** Maximum cost units per time window. Missing windows are unlimited. */
export interface Limits {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
  perMonth?: number;
}

export type Usage = Record<Window, number>;

export type Strategy = "priority" | "weighted" | "least-used";

export interface ProviderEntry {
  /** Unique name inside the hub, used as the quota key. */
  name: string;
  adapter: Adapter;
  limits: Limits;
  weight: number;
  /** Paused by the user on the dashboard: skipped until resumed. */
  paused?: boolean;
  /** "file" for providers from revezo.config.yaml, "panel" for ones added on the dashboard. */
  source?: Source;
}

export type Source = "file" | "panel";

export interface Route {
  name: string;
  kind: string;
  strategy: Strategy;
  providers: ProviderEntry[];
  /** Same-provider retries for temporary errors. */
  maxAttempts: number;
  source?: Source;
  /** Seconds an identical AI request is answered from the cache; 0 or missing turns it off. */
  cacheSeconds?: number;
}

export type AttemptOutcome =
  | "sent"
  | "skipped_full"
  | "skipped_blocked"
  | "skipped_capability"
  | "skipped_paused"
  | "cached"
  | "failed";

export interface Attempt {
  provider: string;
  outcome: AttemptOutcome;
  kind?: ErrorKind;
  message?: string;
}

export interface SendResult<Res = unknown> {
  route: string;
  provider: string;
  result: Res;
  attempts: Attempt[];
}
