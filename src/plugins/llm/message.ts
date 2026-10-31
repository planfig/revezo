export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** An OpenAI-style chat request. The model comes from each provider's options. */
export interface ChatRequest {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  seed?: number;
}

export interface ChatResult {
  model: string;
  content: string;
  finishReason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const ROLES = new Set(["system", "user", "assistant"]);
const MAX_MESSAGES = 200;
const MAX_CHARS = 400_000;
const PASSED_ON = ["max_tokens", "temperature", "top_p", "stop", "seed"] as const;

/** Returns a list of problems; empty means the request is valid. Unknown fields are ignored. */
export function validateChat(input: unknown): string[] {
  const r = input as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return ["body must be a JSON object"];
  const errors: string[] = [];
  if (r.stream === true) errors.push("stream is not supported yet; send stream: false");
  const msgs = r.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) errors.push("messages must be a non-empty list");
  else if (msgs.length > MAX_MESSAGES) errors.push(`at most ${MAX_MESSAGES} messages`);
  else {
    let chars = 0;
    for (const m of msgs as Record<string, unknown>[]) {
      if (!m || typeof m !== "object" || !ROLES.has(m.role as string)) {
        errors.push("every message needs role system, user or assistant");
        break;
      }
      if (typeof m.content !== "string") {
        errors.push("message content must be text (images and tools are not supported yet)");
        break;
      }
      chars += m.content.length;
    }
    if (chars > MAX_CHARS) errors.push(`messages may have at most ${MAX_CHARS} characters in total`);
  }
  const num = (k: string, min: number, max: number, int = false) => {
    const v = r[k];
    if (v === undefined || v === null) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      errors.push(`${k} must be a number from ${min} to ${max}`);
    }
  };
  num("max_tokens", 1, 128_000, true);
  num("temperature", 0, 2);
  num("top_p", 0, 1);
  num("seed", -(2 ** 31), 2 ** 31, true);
  const stop = r.stop;
  if (stop !== undefined && stop !== null && typeof stop !== "string" && !(Array.isArray(stop) && stop.length <= 4 && stop.every((s) => typeof s === "string" && s.length <= 100))) {
    errors.push("stop must be text or up to 4 texts");
  }
  return errors;
}

/** Keeps only the fields Revezo passes on to providers. */
export function toChatRequest(input: Record<string, unknown>): ChatRequest {
  const req: Record<string, unknown> = {
    messages: (input.messages as ChatMessage[]).map((m) => ({ role: m.role, content: m.content })),
  };
  for (const k of PASSED_ON) if (input[k] !== undefined && input[k] !== null) req[k] = input[k];
  return req as unknown as ChatRequest;
}

/** Free plans of LLM APIs mostly count requests, so each call costs one. */
export function chatCost() {
  return { unit: "request", amount: 1 };
}
