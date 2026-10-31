import { ConfigError, ProviderError } from "../../core/errors.ts";
import { requireString, type Plugin, type PluginContext, type PluginField } from "../../core/registry.ts";
import type { Adapter, Limits } from "../../core/types.ts";
import { postJson } from "../http.ts";
import { chatCost, type ChatRequest, type ChatResult } from "./message.ts";

// Local models can take a while to answer.
const TIMEOUT_MS = 120_000;

interface Reply {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: ChatResult["usage"];
}

interface Spec {
  id: string;
  label: string;
  oneAccountPerRoute: boolean;
  fields: PluginField[];
  suggestedLimits: Limits;
  /** Chat completions URL and extra headers for these options. */
  endpoint(options: Record<string, unknown>): { url: string; headers: Record<string, string> };
}

/** Builds a plugin for an API that speaks OpenAI's POST /chat/completions. */
export function openAiCompatible(spec: Spec): Plugin {
  const plugin: Plugin = {
    id: spec.id,
    kind: "llm",
    label: spec.label,
    oneAccountPerRoute: spec.oneAccountPerRoute,
    fields: spec.fields,
    suggestedLimits: spec.suggestedLimits,
    defaultCapabilities: {},
    create(options, ctx: PluginContext): Adapter<ChatRequest, ChatResult> {
      const model = requireString(options, "model", spec.id);
      const { url, headers } = spec.endpoint(options);
      return {
        id: spec.id,
        kind: "llm",
        capabilities: { ...plugin.defaultCapabilities },
        cost: chatCost,
        async send(req, { signal }) {
          let reply: Reply;
          try {
            reply = (await postJson(ctx.fetch, url, headers, { ...req, model, stream: false }, signal, TIMEOUT_MS)) as Reply;
          } catch (err) {
            // An unknown model is this provider's setup, not the request: pause it and try the next one.
            if (err instanceof ProviderError && err.status === 404) throw new ProviderError("auth", err.message, { status: 404 });
            throw err;
          }
          const choice = reply.choices?.[0];
          if (!choice?.message) throw new ProviderError("temporary", `${spec.label} answered without a message`);
          return { model: reply.model ?? model, content: choice.message.content ?? "", finishReason: choice.finish_reason ?? null, usage: reply.usage };
        },
        classifyError(err) {
          return err instanceof ProviderError ? err.kind : "temporary";
        },
      };
    },
  };
  return plugin;
}

const apiKeyField: PluginField = { name: "apiKey", label: "API key", type: "string", required: true, secret: true };

/** OpenRouter: many models behind one key; ":free" models have per-minute and daily request limits. */
export const openrouter = openAiCompatible({
  id: "openrouter",
  label: "OpenRouter",
  oneAccountPerRoute: true,
  fields: [apiKeyField, { name: "model", label: "Model", type: "string", required: true, secret: false, placeholder: "meta-llama/llama-3.3-70b-instruct:free" }],
  suggestedLimits: { perMinute: 20, perDay: 50 },
  endpoint: (o) => ({
    url: "https://openrouter.ai/api/v1/chat/completions",
    headers: { authorization: `Bearer ${requireString(o, "apiKey", "openrouter")}`, "x-title": "Revezo" },
  }),
});

/** Groq: fast hosted open models; the free plan limits each model per minute and per day. */
export const groq = openAiCompatible({
  id: "groq",
  label: "Groq",
  oneAccountPerRoute: true,
  fields: [apiKeyField, { name: "model", label: "Model", type: "string", required: true, secret: false, placeholder: "llama-3.1-8b-instant" }],
  suggestedLimits: { perMinute: 30, perDay: 1000 },
  endpoint: (o) => ({
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { authorization: `Bearer ${requireString(o, "apiKey", "groq")}` },
  }),
});

const DEFAULT_OLLAMA = "http://127.0.0.1:11434";

/** Ollama: models running on your own machine or server. No key, no quota. */
export const ollama = openAiCompatible({
  id: "ollama",
  label: "Ollama",
  oneAccountPerRoute: false,
  fields: [
    { name: "baseUrl", label: "Base URL", type: "string", required: false, secret: false, placeholder: DEFAULT_OLLAMA },
    { name: "model", label: "Model", type: "string", required: true, secret: false, placeholder: "llama3.2" },
  ],
  suggestedLimits: {},
  endpoint: (o) => {
    const raw = typeof o.baseUrl === "string" && o.baseUrl.trim() ? o.baseUrl.trim() : DEFAULT_OLLAMA;
    let base: URL | undefined;
    try {
      base = new URL(raw);
    } catch {}
    if (!base || (base.protocol !== "http:" && base.protocol !== "https:")) {
      throw new ConfigError('Provider "ollama" option "baseUrl" must be an http:// or https:// address');
    }
    const root = base.href.endsWith("/") ? base.href : `${base.href}/`;
    return { url: new URL("v1/chat/completions", root).href, headers: {} };
  },
});
