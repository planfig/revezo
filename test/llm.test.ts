import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../src/config.ts";
import { ConfigError } from "../src/core/errors.ts";
import { MemoryQuotaStore } from "../src/core/quota.ts";
import { registerEmailPlugins } from "../src/plugins/email/index.ts";
import { ollama, registerLlmPlugins, validateChat } from "../src/plugins/llm/index.ts";
import { createServer } from "../src/server.ts";

registerEmailPlugins();
registerLlmPlugins();

const KEY = "k".repeat(32);
type Call = { url: string; headers: Headers; body: any };

/** Fake LLM APIs. `answers` maps a host fragment to the HTTP status it returns. */
function fakeFetch(calls: Call[], answers: Record<string, number> = {}): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const status = Object.entries(answers).find(([host]) => url.includes(host))?.[1] ?? 200;
    if (status === 429) return new Response('{"error":{"message":"Rate limit reached, please try again in 2s"}}', { status, headers: { "retry-after": "2" } });
    if (status !== 200) return new Response('{"error":{"message":"model not found"}}', { status });
    return Response.json({
      model: "served-model",
      choices: [{ message: { role: "assistant", content: `hi from ${new URL(url).hostname}` }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    });
  };
}

function setup(answers: Record<string, number> = {}) {
  const calls: Call[] = [];
  const config = buildConfig(
    {
      defaults: { llm: "ai" },
      routes: {
        ai: {
          kind: "llm",
          providers: [
            { use: "groq", options: { apiKey: "groq-test-key", model: "llama-3.1-8b-instant" }, limits: { perDay: 1000 } },
            { use: "openrouter", options: { apiKey: "or-test-key", model: "some/model:free" }, limits: { perDay: 50 } },
            { use: "ollama", options: { baseUrl: "http://gpu-box.example:11434", model: "llama3.2" } },
          ],
        },
        cheap: { kind: "llm", providers: [{ use: "ollama", name: "ollama-cheap", options: { model: "tiny" } }] },
      },
    },
    { env: {}, fetch: fakeFetch(calls, answers), store: new MemoryQuotaStore(), hubOptions: { sleep: async () => {} } },
  );
  const app = createServer({ hub: config.hub, defaults: config.defaults, apiKey: KEY });
  const chat = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { chat, calls, hub: config.hub };
}

const hello = { messages: [{ role: "user", content: "Hello" }] };

test("answers in OpenAI's format and sends each provider its own model and key", async () => {
  const { chat, calls } = setup();
  const res = await chat({ ...hello, model: "whatever", temperature: 0.2, max_tokens: 50, tools: [{ ignored: true }] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.object, "chat.completion");
  assert.equal(body.choices[0].message.content, "hi from api.groq.com");
  assert.equal(body.choices[0].finish_reason, "stop");
  assert.equal(body.model, "groq/served-model");
  assert.equal(body.usage.total_tokens, 7);
  assert.equal(body.revezo.route, "ai");
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].headers.get("authorization"), "Bearer groq-test-key");
  assert.deepEqual(calls[0].body, { messages: hello.messages, temperature: 0.2, max_tokens: 50, model: "llama-3.1-8b-instant", stream: false });
});

test("a rate-limited provider is skipped and the next one answers", async () => {
  const { chat, calls, hub } = setup({ groq: 429 });
  const body = await (await chat(hello)).json();
  assert.equal(body.revezo.provider, "openrouter");
  assert.equal(calls[1].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[1].headers.get("authorization"), "Bearer or-test-key");
  const status = await hub.status();
  assert.equal(status[0].providers[0].blocked?.reason, "rate_limit");
});

test("an unknown model pauses that provider instead of failing the request", async () => {
  const { chat, calls, hub } = setup({ groq: 404, openrouter: 404 });
  const body = await (await chat(hello)).json();
  assert.equal(body.revezo.provider, "ollama");
  assert.equal(calls.at(-1)!.url, "http://gpu-box.example:11434/v1/chat/completions");
  assert.equal(calls.at(-1)!.headers.get("authorization"), null);
  const [groq] = (await hub.status())[0].providers;
  assert.equal(groq.blocked?.reason, "auth");
});

test("the model field or a header picks the route", async () => {
  const { chat } = setup();
  assert.equal((await (await chat({ ...hello, model: "cheap" })).json()).revezo.provider, "ollama-cheap");
  assert.equal((await (await chat(hello, { "x-revezo-route": "cheap" })).json()).revezo.provider, "ollama-cheap");
});

test("every provider full answers 503 with the attempts", async () => {
  const { chat } = setup({ groq: 429, openrouter: 429, "gpu-box": 503, "127.0.0.1": 503 });
  const res = await chat(hello);
  assert.equal(res.status, 503);
  assert.ok((await res.json()).revezo.attempts.length >= 3);
});

test("chat requests are validated and need the key", async () => {
  const { chat } = setup();
  assert.equal((await chat(hello, { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await chat({ ...hello, stream: true })).status, 400);
  assert.ok(validateChat({ messages: [] }).length);
  assert.ok(validateChat({ messages: [{ role: "tool", content: "x" }] }).length);
  assert.ok(validateChat({ messages: [{ role: "user", content: [{ type: "image_url" }] }] }).length);
  assert.ok(validateChat({ ...hello, temperature: 5 }).length);
  assert.ok(validateChat({ ...hello, max_tokens: 1.5 }).length);
  assert.deepEqual(validateChat({ ...hello, stop: ["\n"], seed: 1 }), []);
});

test("Ollama refuses addresses that are not http(s)", () => {
  assert.throws(() => ollama.create({ baseUrl: "file:///etc/passwd", model: "x" }, { fetch }), ConfigError);
  assert.throws(() => ollama.create({ model: "" }, { fetch }), ConfigError);
});
