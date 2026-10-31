import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NoProviderAvailableError, PermanentFailureError } from "./core/errors.ts";
import type { EventLog } from "./core/events.ts";
import type { Hub } from "./core/hub.ts";
import { dashboardHtml } from "./dashboard.ts";
import { IdempotencyCache, type StoredResponse } from "./idempotency.ts";
import { validateEmail, type EmailMessage } from "./plugins/email/message.ts";

export interface ServerOptions {
  hub: Hub;
  defaults: Record<string, string>;
  /** Clients must send "Authorization: Bearer <apiKey>". Undefined disables auth (local use only). */
  apiKey?: string;
  /** Recent attempts shown on the dashboard. */
  events?: EventLog;
  idempotency?: IdempotencyCache;
}

const MAX_BODY_BYTES = 1024 * 1024;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export function createServer({ hub, defaults, apiKey, events, idempotency = new IdempotencyCache() }: ServerOptions): Hono {
  const app = new Hono();
  const expected = apiKey === undefined ? undefined : digest(apiKey);

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header("Cache-Control", "no-store");
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/", (c) => c.redirect("/dashboard"));
  app.get("/dashboard", (c) => {
    const nonce = randomBytes(16).toString("base64");
    c.header(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; ` +
        "img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    return c.html(dashboardHtml(nonce));
  });

  app.use("/v1/*", async (c, next) => {
    if (expected === undefined) return next();
    const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!timingSafeEqual(digest(given), expected)) return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  app.use("/v1/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "body_too_large" }, 413) }));

  app.get("/v1/quota", async (c) => c.json({ routes: await hub.status() }));

  app.get("/v1/events", (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
    return c.json({ events: events?.list(limit) ?? [] });
  });

  app.post("/v1/email/send", async (c) => {
    let body: (EmailMessage & { route?: string }) | undefined;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const problems = validateEmail(body);
    if (problems.length) return c.json({ error: "invalid_message", problems }, 400);
    const { route: requested, ...message } = body!;

    const routeName = requested ?? c.req.query("route") ?? defaults.email;
    const route = routeName ? hub.route(routeName) : undefined;
    if (!route || route.kind !== "email") return c.json({ error: "unknown_route", route: routeName ?? null }, 404);

    const requires = message.category === "marketing" ? { allowsMarketing: true } : undefined;
    const send = async (): Promise<StoredResponse> => {
      try {
        const sent = await hub.send(route.name, message, { requires });
        return { status: 200, body: { ok: true, provider: sent.provider, result: sent.result, attempts: sent.attempts } };
      } catch (err) {
        if (err instanceof PermanentFailureError) {
          return { status: 422, body: { error: "rejected", message: err.message, attempts: err.attempts } };
        }
        if (err instanceof NoProviderAvailableError) {
          return { status: 503, body: { error: "no_provider_available", attempts: err.attempts } };
        }
        throw err;
      }
    };

    const key = c.req.header("idempotency-key");
    let response: StoredResponse;
    if (key === undefined) {
      response = await send();
    } else {
      if (!IDEMPOTENCY_KEY_RE.test(key)) return c.json({ error: "invalid_idempotency_key" }, 400);
      const fingerprint = createHash("sha256").update(route.name).update(JSON.stringify(message)).digest("hex");
      const pending = idempotency.run(`${route.name}:${key}`, fingerprint, send);
      if (!pending) return c.json({ error: "idempotency_key_reused", message: "This key was already used for a different message" }, 409);
      response = await pending;
    }
    return c.json(response.body as object, response.status as 200);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "error", message: err.message.slice(0, 300) }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

/** Comparing fixed-length digests keeps the check constant-time regardless of key length. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
