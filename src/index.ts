// Library entry point: use Revezo inside another program without the HTTP server.
export * from "./core/types.ts";
export * from "./core/errors.ts";
export { Hub, type HubOptions, type SendOptions } from "./core/hub.ts";
export { MemoryQuotaStore, SqliteQuotaStore, type QuotaStore } from "./core/quota.ts";
export { registerPlugin, getPlugin, type Plugin, type PluginContext } from "./core/registry.ts";
export { buildConfig, loadConfigFile } from "./config.ts";
export { createServer } from "./server.ts";
export * from "./plugins/email/index.ts";
