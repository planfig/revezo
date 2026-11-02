# Revezo

Open source hub that routes API calls across several providers of the same kind.
It counts each provider's quota (per minute, hour, day, month), and when one runs out
or fails, it moves to the next one.

Plugin families so far: **e-mail** (Brevo, Mailjet, any SMTP server) and **AI / LLM**
(OpenRouter, Groq, Ollama). The core knows nothing about either, so the same hub is meant
for SMS, WhatsApp, scraping, social posting and web search too.

> Status: early MVP (v0.5). E-mail and AI (LLM) routing and a live dashboard work;
> SMS, WhatsApp, scraping, social posting and web search are on the [roadmap](#roadmap).

## What it does

- **Failover**: tries providers in order and skips the ones that are full, rate limited or failing.
- **Quota counters**: your own limits per provider, stored in SQLite so they survive restarts.
- **Pauses**: a provider that answers "quota exceeded" is skipped until its counter resets;
  "too many requests" pauses it for a minute (or what `Retry-After` says).
- **Strategies**: `priority` (fill the first one first), `weighted` (spread by weight),
  `least-used` (the one with the most quota left).
- **Responsible use built in**: marketing messages only go through providers that allow
  marketing, require an unsubscribe link (one-click headers are added), and the config
  refuses to list two accounts of the same provider in one route.
- **Live dashboard**: wires from your apps to the hub to each provider, coloured by quota,
  with a dot running along the wire for every message sent.
- **Manage on the fly**: add, pause, reorder or remove providers on the dashboard; the hub
  uses the new setup on the very next call, without a restart.
- **App keys**: each app gets its own key with a daily limit; you see who used what and can revoke one key without touching the others.
- **AI answer cache**: an identical AI request inside the route's cache time is answered without spending quota.
- **Token counts**: tokens reported by AI providers are counted per provider, today and this month.
- **History that survives restarts**: the latest attempts are kept in the SQLite file.
- **No secrets in logs**: logs carry provider names and outcomes, never addresses or content.

## Quick start

Requires Node.js 24 or newer.

```bash
git clone https://github.com/<you>/revezo.git
cd revezo
npm install
cp .env.example .env                                 # fill in your keys
cp revezo.config.example.yaml revezo.config.yaml     # adjust routes and limits
npm start
```

Or with Docker:

```bash
docker build -t revezo .
docker run --env-file .env -v "$PWD/revezo.config.yaml:/app/revezo.config.yaml" -v "$PWD/data:/app/data" -p 8787:8787 revezo
```

## Sending an e-mail

```bash
curl -X POST http://localhost:8787/v1/email/send \
  -H "Authorization: Bearer $REVEZO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": { "email": "news@example.com", "name": "Example" },
    "to": [{ "email": "jane@example.com" }],
    "subject": "Hello",
    "html": "<p>Hi Jane</p>",
    "category": "marketing",
    "unsubscribeUrl": "https://example.com/unsubscribe?u=123"
  }'
```

Answer: `200` with the provider that sent it, `400` invalid message, `422` rejected for a
reason every provider would share (e.g. bad address), `503` every provider full or failing.
Each answer lists the attempts made.

`GET /v1/quota` shows usage, limits and pauses for every provider, `GET /v1/events` the
latest attempts (each has an `id`; `?since=<id>` returns only newer ones). `GET /health`
needs no key.

## Asking an AI model (LLM)

`POST /v1/chat/completions` speaks OpenAI's format, so most tools and libraries that work
with OpenAI work with Revezo: set the base URL to `http://localhost:8787/v1` and the API
key to your `REVEZO_API_KEY`.

```bash
curl http://localhost:8787/v1/chat/completions   -H "Authorization: Bearer $REVEZO_API_KEY"   -H "Content-Type: application/json"   -d '{ "messages": [{ "role": "user", "content": "Write a one-line welcome message" }] }'
```

- Each provider uses the model set in its options; the `model` field of the request picks
  an `llm` route by name (or send `X-Revezo-Route`), otherwise `defaults.llm` is used.
- A provider that answers "rate limit" is paused for the time it asks; "unknown model" or a
  bad key pauses it for an hour; the next provider answers instead.
- Each call counts as one request against the provider's limits (free plans mostly count
  requests). Token counting, streaming, images and tools are not supported yet.
- The answer adds a `revezo` field with the route, the provider and the attempts.

| Provider | Free plan defaults offered | Options |
|---|---|---|
| `openrouter` | 20/min, 50/day (`:free` models) | `apiKey`, `model` |
| `groq` | 30/min, 1000/day | `apiKey`, `model` |
| `ollama` | no limit (your own machine) | `baseUrl` (default `http://127.0.0.1:11434`), `model` |

Free plan limits change often and differ per model: check each provider's page and adjust.

### App keys

Instead of giving every program your main `REVEZO_API_KEY`, create one key per app on the
dashboard (card "App keys"), optionally with a daily call limit. App keys start with
`rvz_`, are shown once and stored only as a SHA-256 hash. They can call
`POST /v1/email/send` and `POST /v1/chat/completions` and nothing else; a call over the
limit gets `429 app_limit`. The history shows which app made each call.

| Call | Does |
|---|---|
| `POST /v1/admin/keys` | `{ "name", "perDay" }` → `{ "id", "key" }` (the only time the key is shown). |
| `DELETE /v1/admin/keys/:id` | Revokes a key. |

### AI answer cache

Set `cacheSeconds` on an `llm` route (in the config or with the route's Cache menu on the
dashboard: off, 1 minute, 10 minutes, 1 hour, 24 hours). A request with the same messages
and settings inside that time is answered from memory, marked `"revezo": { "cached": true }`,
and uses no provider quota. Leave it off for requests that must always get a fresh answer.

### Avoiding double sends

If your client retries after a timeout, send an `Idempotency-Key` header (8–128 letters,
digits, `_ . : -`). A repeat with the same key and message gets the first answer instead of
a second e-mail; the same key with a different message gets `409`. Keys are remembered in
memory for 24 hours.

## Dashboard

Open `http://localhost:8787/dashboard`. The first time, prove you own the server with your
`REVEZO_API_KEY` and choose a user and password; after that you sign in with them. After
3 wrong tries a captcha (drawn by Revezo itself, no outside service) is asked, and after 10
the address is locked for 15 minutes. Forgot the password? "Forgot the password?" lets you
choose a new one with the `REVEZO_API_KEY`. Programs keep using the key as a Bearer token. The page is in English or Portuguese, following the browser language,
and works on phones.

**Live view.** One dark "screen" per sector, stacked so you scroll down through them:
e-mail, SMS, WhatsApp, AI (LLM), scraping, social posting and web search (plus any other
kind you add). Chips at the top jump to each sector. In each screen, the sector's glowing
core links to one card per route; click a card to fan its providers out on an arc.
Everything refreshes every 3 seconds. Sectors without a plugin yet show as "coming soon".

- Each wire's colour is the provider's state: green free, orange at 80% or more of a limit,
  red full or paused after errors, grey (dashed) paused by you.
- The thicker the wire, the more it sent today.
- A dot runs core → route → provider for every call sent; a red ✕ appears on the wire when an attempt fails.
- The ring of ticks around the core grows when the sector is busy.
  With "reduce motion" turned on in the system, dots appear without moving.
- Each provider shows used / limit for today and a five-step usage bar in its state colour.

**Managing APIs.** Below the diagram you can add a provider (the form lists the available
types, their fields and the free plan limits), change limits and weight, move providers up
or down, pause and resume them, remove them, create routes and change a route's strategy.
The hub swaps to the new routes at once: the next call uses them, calls already running
finish with the old ones.

- Providers from `revezo.config.yaml` show as **from the file**: they can be paused and
  reordered, but changed or removed only in the file.
- Providers added on the dashboard are saved in `storage.sqlite` with their options
  encrypted (AES-256-GCM, key derived from `REVEZO_SECRETS_KEY`). The API never sends keys
  back, only whether each one is set.
- The dashboard is **read only**, and says why, when `REVEZO_SECRETS_KEY` is missing,
  when `storage.sqlite` is not set (counters in memory) or when the server runs without
  `REVEZO_API_KEY`.
- The same rules as the config apply: unique provider names and one account per provider
  per route.

### Management API

All need `Authorization: Bearer $REVEZO_API_KEY`; bodies are JSON, at most 16 KB.

| Call | Does |
|---|---|
| `GET /v1/admin/state` | Routes, providers with usage and state, available provider types, whether changes are allowed. |
| `POST /v1/admin/routes` | New route: `{ "name", "kind", "strategy" }`. |
| `PATCH /v1/admin/routes/:name` | `{ "strategy" }` and/or `{ "order": [provider names] }`. |
| `DELETE /v1/admin/routes/:name` | Removes an empty route created on the dashboard. |
| `POST /v1/admin/providers` | `{ "route", "use", "name", "options", "limits", "weight", "capabilities" }`. |
| `PATCH /v1/admin/providers/:name` | `{ "paused" }`, and for dashboard providers `{ "options", "limits", "weight", "capabilities" }`. In `options` a secret sent empty keeps the saved one, so a new API key can be set without retyping the rest; a new key also lifts a pause caused by the old one. |
| `DELETE /v1/admin/providers/:name` | Removes a provider added on the dashboard. |

## Configuration

See [revezo.config.example.yaml](revezo.config.example.yaml). Credentials are written as
`${NAME}` and read from the environment, so the config file itself holds no secrets.

| Field | Meaning |
|---|---|
| `server.host` | `127.0.0.1` (default, this machine only) or `0.0.0.0`. Env `HOST` overrides it; the Docker image uses `0.0.0.0`. |
| `server.port` | Default `8787`. Env `PORT` overrides it. |
| `timezone` | When daily and monthly counters reset (default `UTC`). |
| `storage.sqlite` | Path of the database for counters and for providers added on the dashboard. Omit to keep counters in memory (the dashboard is then read only). |
| `routes.<name>.kind` | API kind, e.g. `email`. |
| `routes.<name>.strategy` | `priority`, `weighted` or `least-used`. |
| `routes.<name>.cacheSeconds` | For `llm` routes: seconds an identical request is answered from the cache (0 = off, at most 86400). |
| `routes.<name>.providers` | The route's providers. May be empty or left out: add them on the dashboard instead. |
| `providers[].use` | Provider type (`brevo`, `mailjet`, `smtp`, `openrouter`, `groq`, `ollama`). |
| `providers[].limits` | `perMinute`, `perHour`, `perDay`, `perMonth`. |
| `providers[].capabilities` | Override flags, e.g. `allowsMarketing: true` for an SMTP server that allows it. |

## Use as a library

```ts
import { buildConfig, registerEmailPlugins } from "revezo";

registerEmailPlugins();
const { hub } = buildConfig(myConfigObject);
await hub.send("email-marketing", message, { requires: { allowsMarketing: true } });
```

## Ideas taken from other open source projects

Revezo borrows proven ideas and keeps its own focus (several kinds of API in one hub,
free-quota counting, a live dashboard):

| Idea | Seen in | In Revezo |
|---|---|---|
| OpenAI-compatible endpoint with fallbacks | LiteLLM, Portkey | ✅ v0.4 |
| Per-app ("virtual") keys with their own limits | LiteLLM | ✅ v0.5 |
| Answer cache to save calls | Portkey, LiteLLM | ✅ v0.5 (exact match) |
| Token usage per provider | LiteLLM | ✅ v0.5 (counted, not limited yet) |
| Request history | Portkey | ✅ v0.5 (last 5,000 attempts) |
| Streaming answers, token limits | LiteLLM | planned |
| Alerts when a provider is almost full (Telegram, e-mail) | LiteLLM | planned |
| One message over several channels with fallback (e-mail → SMS → WhatsApp) | Novu | planned |
| Many notification services through one simple URL format | Apprise | planned |

## Use responsibly

Free plans exist to let people try a service. Before you route traffic through them:

- **One account per provider.** Several providers (e.g. Resend, Sweego) explicitly forbid
  creating multiple accounts to get around their limits.
- **Check each provider's terms** for marketing on the plan you use.
- **Authenticate your domain** with SPF, DKIM and DMARC for every provider you add.
  Consider a separate subdomain for marketing.
- **Only send to people who opted in**, honour unsubscribes everywhere, and list the
  providers you use in your privacy policy (GDPR).

## Roadmap

- **v0.3** ✅ live dashboard with wires, provider management without restarts.
- **v0.4** ✅ AI routing with an OpenAI-compatible endpoint (OpenRouter, Groq, Ollama).
- **v0.5** ✅ app keys with daily limits, AI answer cache, token counts, history kept on disk.
- **next** streaming and token limits for AI; alerts near the limit; Cerebras, Gemini, Mistral plugins.
- **next** shared suppression list fed by provider webhooks (bounces, complaints, unsubscribes); queue for "send tomorrow"; Resend, Mailgun, SMTP2GO, Amazon SES plugins.
- **next** listmonk integration guide, Cloudflare Workers deployment.
- **v0.5** social posting with a "fan-out" strategy (Meta, LinkedIn, Bluesky, Telegram).
- **v1.0** SMS/WhatsApp, cost-based routing with spending caps.

Want a new provider? See [docs/writing-a-plugin.md](docs/writing-a-plugin.md).

## License

[MIT](LICENSE)
