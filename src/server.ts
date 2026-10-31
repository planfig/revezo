import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { NoProviderAvailableError, PermanentFailureError } from "./core/errors.ts";
import type { Hub } from "./core/hub.ts";
import { validateEmail, type EmailMessage } from "./plugins/email/message.ts";

export interface ServerOptions {
  hub: Hub;
  defaults: Record<string, string>;
  /** Clients must send "Authorization: Bearer <apiKey>". Undefined disables auth (local use only). */
  apiKey?: string;
}

export function createServer({ hub, defaults, apiKey }: ServerOptions): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", async (c, next) => {
    if (apiKey === undefined) return next();
    const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!safeEqual(given, apiKey)) return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  app.get("/v1/quota", async (c) => c.json({ routes: await hub.status() }));

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
    try {
      const sent = await hub.send(route.name, message, { requires });
      return c.json({ ok: true, provider: sent.provider, result: sent.result, attempts: sent.attempts });
    } catch (err) {
      if (err instanceof PermanentFailureError) {
        return c.json({ error: "rejected", message: err.message, attempts: err.attempts }, 422);
      }
      if (err instanceof NoProviderAvailableError) {
        return c.json({ error: "no_provider_available", attempts: err.attempts }, 503);
      }
      throw err;
    }
  });

  app.onError((err, c) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: "error", message: err.message }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
