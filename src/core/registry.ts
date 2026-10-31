import { ConfigError } from "./errors.ts";
import type { Adapter } from "./types.ts";

export interface PluginContext {
  fetch: typeof fetch;
}

export interface Plugin {
  /** Provider type used in the config's "use:" field, e.g. "brevo". */
  id: string;
  kind: string;
  /**
   * True when the provider's terms forbid several accounts to add up free quotas.
   * The config loader refuses to list such a provider twice in one route.
   */
  oneAccountPerRoute: boolean;
  create(options: Record<string, unknown>, ctx: PluginContext): Adapter;
}

const plugins = new Map<string, Plugin>();

export function registerPlugin(plugin: Plugin): void {
  plugins.set(`${plugin.kind}:${plugin.id}`, plugin);
}

export function getPlugin(kind: string, id: string): Plugin {
  const plugin = plugins.get(`${kind}:${id}`);
  if (!plugin) {
    const known = [...plugins.values()].filter((p) => p.kind === kind).map((p) => p.id);
    throw new ConfigError(`Unknown ${kind} provider "${id}". Available: ${known.join(", ") || "none"}`);
  }
  return plugin;
}

/** Reads a required string option without ever echoing its value. */
export function requireString(options: Record<string, unknown>, key: string, plugin: string): string {
  const value = options[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Provider "${plugin}" needs option "${key}"`);
  }
  return value;
}
