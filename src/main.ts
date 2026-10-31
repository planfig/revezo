import { serve } from "@hono/node-server";
import { loadConfigFile } from "./config.ts";
import { ConfigError } from "./core/errors.ts";
import { registerEmailPlugins } from "./plugins/email/index.ts";
import { createServer } from "./server.ts";

registerEmailPlugins();

const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));

try {
  const apiKey = process.env.REVEZO_API_KEY || undefined;
  if (!apiKey && process.env.REVEZO_ALLOW_NO_AUTH !== "true") {
    throw new ConfigError("Set REVEZO_API_KEY (or REVEZO_ALLOW_NO_AUTH=true for local tests only).");
  }
  const config = loadConfigFile(process.env.REVEZO_CONFIG || "revezo.config.yaml", {
    hubOptions: { onAttempt: (route, a) => log("attempt", { route, ...a }) },
  });
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey });
  serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    log("listening", { port: info.port, routes: config.hub.routes().map((r) => r.name), auth: apiKey ? "on" : "OFF" });
  });
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Revezo could not start: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
