import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NoProviderAvailableError, PermanentFailureError } from "./core/errors.ts";
import type { EventLog } from "./core/events.ts";
import type { Hub } from "./core/hub.ts";
import { dashboardHtml } from "./dashboard.ts";
import { IdempotencyCache, type StoredResponse } from "./idempotency.ts";
import { ManageError, Manager } from "./manager.ts";
import { validateEmail, type EmailMessage } from "./plugins/email/message.ts";
import { toChatRequest, validateChat, type ChatRequest, type ChatResult } from "./plugins/llm/message.ts";

export interface ServerOptions {
  hub: Hub;
  defaults: Record<string, string>;
  /** Clients must send "Authorization: Bearer <apiKey>". Undefined disables auth (local use only). */
  apiKey?: string;
  /** Recent attempts shown on the dashboard. */
  events?: EventLog;
  idempotency?: IdempotencyCache;
  /** Changes routes from the dashboard. Without one the dashboard is read only. */
  manager?: Manager;
}

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_ADMIN_BODY_BYTES = 16 * 1024;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export function createServer({ hub, defaults, apiKey, events, idempotency = new IdempotencyCache(), manager }: ServerOptions): Hono {
  const app = new Hono();
  const panel = manager ?? new Manager({ hub, defaults });
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

  app.use("/v1/admin/*", bodyLimit({ maxSize: MAX_ADMIN_BODY_BYTES, onError: (c) => c.json({ error: "body_too_large" }, 413) }));
  app.use("/v1/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "body_too_large" }, 413) }));

  app.get("/v1/quota", async (c) => c.json({ routes: await hub.status() }));

  app.get("/v1/events", (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
    const sinceRaw = c.req.query("since");
    const since = sinceRaw === undefined ? undefined : Number(sinceRaw);
    if (since !== undefined && (!Number.isInteger(since) || since < 0)) return c.json({ error: "invalid_since" }, 400);
    return c.json({ events: events?.list(limit, since) ?? [], last: events?.lastId ?? 0 });
  });

  // Dashboard management. Reading works always; changes need REVEZO_API_KEY, a SQLite
  // storage and REVEZO_SECRETS_KEY. Answers never contain option values.
  app.get("/v1/admin/state", async (c) => {
    const state = await panel.state();
    if (apiKey === undefined) return c.json({ ...state, writable: false, reason: "no_api_key" });
    return c.json(state);
  });

  const change = (fn: (body: unknown, name: string) => void, withBody = true) =>
    async (c: Context) => {
      if (apiKey === undefined) return c.json({ error: "read_only", reason: "no_api_key" }, 409);
      let body: unknown;
      if (withBody) {
        try {
          body = await c.req.json();
        } catch {
          return c.json({ error: "invalid_json" }, 400);
        }
      }
      try {
        fn(body, c.req.param("name") ?? "");
      } catch (err) {
        if (err instanceof ManageError) return c.json({ error: err.code, message: err.message }, err.status);
        throw err;
      }
      return c.json({ ok: true });
    };

  app.post("/v1/admin/routes", change((body) => panel.addRoute(body)));
  app.patch("/v1/admin/routes/:name", change((body, name) => panel.updateRoute(name, body)));
  app.delete("/v1/admin/routes/:name", change((_, name) => panel.removeRoute(name), false));
  app.post("/v1/admin/providers", change((body) => panel.addProvider(body)));
  app.patch("/v1/admin/providers/:name", change((body, name) => panel.updateProvider(name, body)));
  app.delete("/v1/admin/providers/:name", change((_, name) => panel.removeProvider(name), false));

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

  // OpenAI-compatible chat endpoint: point any OpenAI client at Revezo with base URL
  // http://host:port/v1 and REVEZO_API_KEY as the key. "model" picks an llm route by
  // name; otherwise the default llm route is used. Each provider uses its own model.
  app.post("/v1/chat/completions", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { message: "invalid JSON", type: "invalid_request_error" } }, 400);
    }
    const problems = validateChat(body);
    if (problems.length) return c.json({ error: { message: problems.join("; "), type: "invalid_request_error" }, problems }, 400);

    const llmRoutes = hub.routes().filter((r) => r.kind === "llm");
    const asked = c.req.header("x-revezo-route") ?? (typeof body.model === "string" ? body.model : undefined);
    const route =
      llmRoutes.find((r) => r.name === asked) ??
      llmRoutes.find((r) => r.name === defaults.llm) ??
      (llmRoutes.length === 1 ? llmRoutes[0] : undefined);
    if (!route) return c.json({ error: { message: "no llm route; add one in the config or on the dashboard", type: "invalid_request_error" } }, 404);

    try {
      const sent = await hub.send<ChatRequest, ChatResult>(route.name, toChatRequest(body));
      const r = sent.result;
      return c.json({
        id: `chatcmpl-${randomBytes(12).toString("hex")}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: `${sent.provider}/${r.model}`,
        choices: [{ index: 0, message: { role: "assistant", content: r.content }, finish_reason: r.finishReason ?? "stop" }],
        usage: r.usage,
        revezo: { route: route.name, provider: sent.provider, attempts: sent.attempts },
      });
    } catch (err) {
      if (err instanceof PermanentFailureError) {
        return c.json({ error: { message: err.message, type: "invalid_request_error" }, revezo: { attempts: err.attempts } }, 422);
      }
      if (err instanceof NoProviderAvailableError) {
        return c.json({ error: { message: "every provider of the route is full, paused or failing", type: "no_provider_available" }, revezo: { attempts: err.attempts } }, 503);
      }
      throw err;
    }
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
