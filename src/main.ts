import { serve } from "@hono/node-server";
import { loadConfigFile } from "./config.ts";
import { ConfigError } from "./core/errors.ts";
import { EventLog } from "./core/events.ts";
import { registerEmailPlugins } from "./plugins/email/index.ts";
import { createServer } from "./server.ts";

registerEmailPlugins();

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
  const events = new EventLog();
  const config = loadConfigFile(process.env.REVEZO_CONFIG || "revezo.config.yaml", {
    hubOptions: {
      onAttempt: (route, a) => {
        events.add(route, a);
        log("attempt", { route, ...a });
      },
    },
  });
  if (!apiKey && config.server.host !== "127.0.0.1" && config.server.host !== "localhost") {
    throw new ConfigError("Without REVEZO_API_KEY the server may only listen on 127.0.0.1.");
  }
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey, events });
  const server = serve({ fetch: app.fetch, port: config.server.port, hostname: config.server.host }, (info) => {
    log("listening", {
      host: config.server.host,
      port: info.port,
      routes: config.hub.routes().map((r) => r.name),
      auth: apiKey ? "on" : "OFF",
    });
  });
  const stop = () => {
    log("stopping");
    server.close(() => process.exit(0));
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
