import { registerPlugin } from "../../core/registry.ts";
import { groq, ollama, openrouter } from "./openai-compatible.ts";

export * from "./message.ts";
export { groq, ollama, openAiCompatible, openrouter } from "./openai-compatible.ts";

export function registerLlmPlugins(): void {
  for (const p of [openrouter, groq, ollama]) registerPlugin(p);
}
