import type { Attempt, ErrorKind } from "./types.ts";

/** Error thrown by adapters so the router knows how to react. */
export class ProviderError extends Error {
  kind: ErrorKind;
  status?: number;
  retryAfterMs?: number;

  constructor(kind: ErrorKind, message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Every provider in the route was full, blocked or failed. */
export class NoProviderAvailableError extends Error {
  attempts: Attempt[];

  constructor(route: string, attempts: Attempt[]) {
    super(`No provider available for route "${route}"`);
    this.name = "NoProviderAvailableError";
    this.attempts = attempts;
  }
}

/** The request was rejected for a reason other providers would share (e.g. invalid address). */
export class PermanentFailureError extends Error {
  attempts: Attempt[];

  constructor(message: string, attempts: Attempt[]) {
    super(message);
    this.name = "PermanentFailureError";
    this.attempts = attempts;
  }
}

/** Configuration problem detected at startup. Never includes secret values. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Classifies an HTTP status (and body text) the way most provider APIs behave. */
export function classifyHttp(status: number, body = ""): ErrorKind {
  const quotaWords = /quota|limit|credit|exceeded|exhausted/i;
  if (status === 429) return quotaWords.test(body) && /daily|monthly|quota|credit/i.test(body) ? "quota" : "rate_limit";
  if (status === 401) return "auth";
  if (status === 402) return "quota";
  if (status === 403) return quotaWords.test(body) ? "quota" : "auth";
  if (status === 408 || status >= 500) return "temporary";
  // A 400 about the sender or domain is this provider's setup, not the message: try the next one.
  if (/sender|from address|not (verified|validated)|unauthori[sz]ed/i.test(body)) return "auth";
  return "permanent";
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
