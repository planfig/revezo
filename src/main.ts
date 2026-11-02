import { serve } from "@hono/node-server";
import { loadConfigFile } from "./config.ts";
import { ConfigError } from "./core/errors.ts";
import { EventLog } from "./core/events.ts";
import { Manager } from "./manager.ts";
import { registerEmailPlugins } from "./plugins/email/index.ts";
import { registerLlmPlugins } from "./plugins/llm/index.ts";
import { createServer } from "./server.ts";

registerEmailPlugins();
registerLlmPlugins();

const MIN_KEY_LENGTH = 24;

const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));

try {
  const apiKey = process.env.REVEZO_API_KEY || undefined;
  if (!apiKey && process.env.REVEZO_ALLOW_NO_AUTH !== "true") {
    throw new ConfigError("Set REVEZO_API_KEY (or REVEZO_ALLOW_NO_AUTH=true for local tests only).");
  }
  if (apiKey && apiKey.length < MIN_KEY_LENGTH) {
    throw new ConfigError(`REVEZO_API_KEY must have at least ${MIN_KEY_LENGTH} characters. Generate one with: node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`);
  }
  // Replaced below by one that also writes to storage.sqlite, once the config says where it is.
  let events = new EventLog();
  const config = loadConfigFile(process.env.REVEZO_CONFIG || "revezo.config.yaml", {
    hubOptions: {
      onAttempt: (route, a, app) => {
        events.add(route, a, new Date(), app);
        log("attempt", { route, ...a, ...(app ? { app } : {}) });
      },
    },
  });
  events = new EventLog(200, config.storagePath);
  if (!apiKey && config.server.host !== "127.0.0.1" && config.server.host !== "localhost") {
    throw new ConfigError("Without REVEZO_API_KEY the server may only listen on 127.0.0.1.");
  }
  const manager = new Manager({
    hub: config.hub,
    ctx: config.pluginContext,
    storagePath: config.storagePath,
    secretsKey: process.env.REVEZO_SECRETS_KEY || undefined,
    defaults: config.defaults,
  });
  for (const warning of manager.warnings) log("warning", { message: warning });
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey, events, manager });
  const server = serve({ fetch: app.fetch, port: config.server.port, hostname: config.server.host }, (info) => {
    log("listening", {
      host: config.server.host,
      port: info.port,
      routes: config.hub.routes().map((r) => r.name),
      auth: apiKey ? "on" : "OFF",
      dashboard: manager.writable && apiKey ? "read-write" : `read-only (${apiKey ? manager.readOnlyReason : "no_api_key"})`,
    });
  });
  const stop = () => {
    log("stopping");
    server.close(() => {
      manager.close();
      events.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Revezo could not start: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
