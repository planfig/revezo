import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Auth, MAX_PASSWORD, MIN_PASSWORD, USER_RE } from "./auth.ts";
import { NoProviderAvailableError, PermanentFailureError } from "./core/errors.ts";
import type { EventLog } from "./core/events.ts";
import type { Hub } from "./core/hub.ts";
import { dashboardHtml } from "./dashboard.ts";
import { IdempotencyCache, type StoredResponse } from "./idempotency.ts";
import { ResponseCache } from "./cache.ts";
import { appCounter, ManageError, Manager } from "./manager.ts";
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
  /** Dashboard login. Defaults to one stored through the manager. */
  auth?: Auth;
}

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_ADMIN_BODY_BYTES = 16 * 1024;
const MAX_AUTH_BODY_BYTES = 4 * 1024;
const SESSION_COOKIE = "revezo_session";
const CAPTCHA_ID_RE = /^[a-f0-9]{32}$/;
/** What an app key may call; everything else needs the main key or a dashboard login. */
const APP_KEY_PATHS = new Set(["/v1/email/send", "/v1/chat/completions"]);
const MAX_CACHED_CHARS = 200_000;

export type Env = { Variables: { app?: string } };
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export function createServer({ hub, defaults, apiKey, events, idempotency = new IdempotencyCache(), manager, auth }: ServerOptions): Hono<Env> {
  const app = new Hono<Env>();
  const chatCache = new ResponseCache<{ provider: string; model: string; content: string; finishReason: string | null; usage?: unknown }>();
  const panel = manager ?? new Manager({ hub, defaults });
  const login = auth ?? new Auth(panel);
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

  // Programs send REVEZO_API_KEY as a Bearer token; the dashboard uses the session cookie
  // from its login. Cookie requests that change something must also send X-Revezo-Panel,
  // which other sites cannot add (on top of SameSite=Strict).
  app.use("/v1/*", async (c, next) => {
    if (expected === undefined) return next();
    const header = c.req.header("authorization");
    if (header !== undefined) {
      const given = header.replace(/^Bearer\s+/i, "");
      if (timingSafeEqual(digest(given), expected)) return next();
      // App keys: only the sending endpoints, within the key's own daily limit.
      const key = panel.findAppKey(given);
      if (!key) return c.json({ error: "unauthorized" }, 401);
      if (c.req.method !== "POST" || !APP_KEY_PATHS.has(c.req.path)) return c.json({ error: "app_key_scope", message: "App keys can only send" }, 403);
      if (!(await hub.reserve(appCounter(key.id), key.perDay === null ? {} : { perDay: key.perDay }))) {
        return c.json({ error: "app_limit", message: `The daily limit of app key "${key.name}" is used up` }, 429);
      }
      c.set("app", key.name);
      return next();
    }
    if (!login.session(getCookie(c, SESSION_COOKIE))) return c.json({ error: "unauthorized" }, 401);
    if (c.req.method !== "GET" && c.req.header("x-revezo-panel") !== "1") return c.json({ error: "missing_panel_header" }, 403);
    return next();
  });

  // ---------- dashboard login ----------

  app.use("/auth/*", bodyLimit({ maxSize: MAX_AUTH_BODY_BYTES, onError: (c) => c.json({ error: "body_too_large" }, 413) }));

  const startSession = (c: Context<Env>, token: string) =>
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      secure: new URL(c.req.url).protocol === "https:",
      maxAge: 12 * 3600,
    });

  const readBody = async (c: Context<Env>): Promise<Record<string, unknown> | null> => {
    try {
      const body = await c.req.json();
      return body && typeof body === "object" && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  };

  app.get("/auth/status", (c) => {
    const ip = clientIp(c);
    return c.json({
      auth: expected !== undefined,
      admin: login.hasAdmin(),
      loggedIn: expected === undefined || login.session(getCookie(c, SESSION_COOKIE)) !== undefined,
      captcha: login.needsCaptcha(ip),
      lockedFor: login.lockedFor(ip),
    });
  });

  // Creates the login, or replaces a forgotten password. REVEZO_API_KEY is the master key.
  app.post("/auth/setup", async (c) => {
    if (expected === undefined) return c.json({ error: "no_api_key" }, 409);
    const ip = clientIp(c);
    const locked = login.lockedFor(ip);
    if (locked) return c.json({ error: "locked", retryAfterSec: locked }, 429);
    const body = await readBody(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const { apiKey: given, user, password } = body;
    if (typeof given !== "string" || !timingSafeEqual(digest(given), expected)) {
      login.recordFailure(ip);
      return c.json({ error: "wrong_api_key" }, 401);
    }
    if (typeof user !== "string" || !USER_RE.test(user)) return c.json({ error: "invalid_user" }, 400);
    if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return c.json({ error: "weak_password", min: MIN_PASSWORD }, 400);
    }
    login.clearFailures(ip);
    startSession(c, await login.setCredentials(user, password));
    return c.json({ ok: true });
  });

  app.post("/auth/login", async (c) => {
    const body = await readBody(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_PASSWORD) : "");
    const captcha = body.captchaId ? { id: str(body.captchaId), answer: str(body.captcha) } : undefined;
    const result = await login.login(clientIp(c), str(body.user), str(body.password), captcha);
    if (result.ok) {
      startSession(c, result.token);
      return c.json({ ok: true });
    }
    if (result.code === "locked") return c.json({ error: "locked", retryAfterSec: result.retryAfterSec }, 429);
    return c.json({ error: result.code, captcha: result.captcha }, result.code === "wrong_login" ? 401 : 400);
  });

  app.post("/auth/logout", (c) => {
    login.logout(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/auth/captcha", (c) => c.json({ id: login.newCaptcha() }));

  app.get("/auth/captcha/:file", (c) => {
    const id = c.req.param("file").replace(/\.svg$/, "");
    const svg = CAPTCHA_ID_RE.test(id) ? login.captchaSvg(id) : undefined;
    if (!svg) return c.json({ error: "not_found" }, 404);
    c.header("Content-Security-Policy", "default-src 'none'");
    return c.body(svg, 200, { "content-type": "image/svg+xml" });
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

  const change = (fn: (body: unknown, name: string) => void | Promise<void>, withBody = true) =>
    async (c: Context<Env>) => {
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
        await fn(body, c.req.param("name") ?? "");
      } catch (err) {
        if (err instanceof ManageError) return c.json({ error: err.code, message: err.message }, err.status);
        throw err;
      }
      return c.json({ ok: true });
    };

  app.post("/v1/admin/keys", async (c) => {
    if (apiKey === undefined) return c.json({ error: "read_only", reason: "no_api_key" }, 409);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    try {
      return c.json({ ok: true, ...panel.createAppKey(body) });
    } catch (err) {
      if (err instanceof ManageError) return c.json({ error: err.code, message: err.message }, err.status);
      throw err;
    }
  });
  app.delete("/v1/admin/keys/:name", change((_, id) => panel.removeAppKey(id), false));
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
        const sent = await hub.send(route.name, message, { requires, app: c.get("app") });
        return { status: 200, body: { ok: true, provider: sent.provider, result: sent.result, attempts: sent.attempts } };
      } catch (err) {
        if (err instanceof PermanentFailureError) {
          return { status: 422, body: { error: "rejected", message: err.message, attempts: err.attempts } };
        }
        if (err instanceof NoProviderAvailableError) {
          return { status: 503, body: { error: "no_provider_available", message: noProviderMessage(route.providers.length), attempts: err.attempts } };
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

    const answer = (provider: string, r: { model: string; content: string; finishReason: string | null; usage?: unknown }, revezo: object) => ({
      id: `chatcmpl-${randomBytes(12).toString("hex")}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: `${provider}/${r.model}`,
      choices: [{ index: 0, message: { role: "assistant", content: r.content }, finish_reason: r.finishReason ?? "stop" }],
      usage: r.usage,
      revezo: { route: route.name, provider, ...revezo },
    });
    const req = toChatRequest(body);
    // An identical request inside the route's cache time is answered without using quota.
    const ttl = route.cacheSeconds ?? 0;
    const cacheKey = ttl > 0 ? createHash("sha256").update(route.name).update("\n").update(JSON.stringify(req)).digest("hex") : undefined;
    const hit = cacheKey ? chatCache.get(cacheKey) : undefined;
    if (hit) {
      events?.add(route.name, { provider: hit.provider, outcome: "cached" }, new Date(), c.get("app"));
      return c.json(answer(hit.provider, hit, { cached: true, attempts: [] }));
    }
    try {
      const sent = await hub.send<ChatRequest, ChatResult>(route.name, req, { app: c.get("app") });
      const r = sent.result;
      if (cacheKey && r.content.length <= MAX_CACHED_CHARS) chatCache.set(cacheKey, { provider: sent.provider, ...r }, ttl * 1000);
      return c.json(answer(sent.provider, r, { cached: false, attempts: sent.attempts }));
    } catch (err) {
      if (err instanceof PermanentFailureError) {
        return c.json({ error: { message: err.message, type: "invalid_request_error" }, revezo: { attempts: err.attempts } }, 422);
      }
      if (err instanceof NoProviderAvailableError) {
        return c.json({ error: { message: noProviderMessage(route.providers.length), type: "no_provider_available" }, revezo: { attempts: err.attempts } }, 503);
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

/** The address the request came from. Behind a proxy this is the proxy (X-Forwarded-For is not trusted). */
function clientIp(c: Context<Env>): string {
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local";
  }
}

function noProviderMessage(providers: number): string {
  return providers ? "every provider of the route is full, paused or failing" : "this route has no provider yet; add one on the dashboard";
}

/** Comparing fixed-length digests keeps the check constant-time regardless of key length. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
