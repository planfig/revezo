import { ConfigError } from "./errors.ts";
import type { Adapter, Limits } from "./types.ts";

export interface PluginContext {
  fetch: typeof fetch;
}

/** One option of a provider, described so the dashboard can draw a form for it. */
export interface PluginField {
  name: string;
  label: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  /** Secret values are stored encrypted and never sent back by the API. */
  secret: boolean;
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
  /** Name shown on the dashboard, e.g. "Brevo". */
  label?: string;
  /** Options the provider takes. Plugins without fields can only be added in the config file. */
  fields?: PluginField[];
  /** Free plan limits, offered as defaults on the dashboard. */
  suggestedLimits?: Limits;
  /** Capabilities of the adapters it creates, before any override. */
  defaultCapabilities?: Record<string, unknown>;
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

export function listPlugins(): Plugin[] {
  return [...plugins.values()];
}

/** Reads a required string option without ever echoing its value. */
export function requireString(options: Record<string, unknown>, key: string, plugin: string): string {
  const value = options[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Provider "${plugin}" needs option "${key}"`);
  }
  return value;
}
