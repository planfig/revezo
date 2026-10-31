# Revezo

Open source hub that routes API calls across several providers of the same kind.
It counts each provider's quota (per minute, hour, day, month), and when one runs out
or fails, it moves to the next one.

The first plugin family is **e-mail** (Brevo, Mailjet, any SMTP server). The core knows
nothing about e-mail, so the same hub is meant for LLM APIs, social posting, SMS and more.

> Status: early MVP (v0.3). E-mail routing and a live dashboard work; suppression lists,
> queueing and more provider types are on the [roadmap](#roadmap).

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

### Avoiding double sends

If your client retries after a timeout, send an `Idempotency-Key` header (8–128 letters,
digits, `_ . : -`). A repeat with the same key and message gets the first answer instead of
a second e-mail; the same key with a different message gets `409`. Keys are remembered in
memory for 24 hours.

## Dashboard

Open `http://localhost:8787/dashboard` and paste your `REVEZO_API_KEY`. The key stays only
in that browser tab. The page is in English or Portuguese, following the browser language,
and works on phones.

**Live view.** A diagram of *Clients → Hub → providers*, grouped by route, refreshed every
3 seconds:

- Each wire's colour is the provider's state: green free, orange at 80% or more of a limit,
  red full or paused after errors, grey (dashed) paused by you.
- The thicker the wire, the more it sent today.
- A dot runs along the wire for every message sent; a red ✕ appears on it when an attempt fails.
  With "reduce motion" turned on in the system, dots appear without moving.
- Each box shows used / limit for today and this month, and "paused until …" when paused.

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

To try it without any real account: `npm run demo` starts a server with fake providers
and made-up traffic at `http://127.0.0.1:8788/dashboard` (the key is printed in the terminal).
Nothing is sent anywhere.

### Management API

All need `Authorization: Bearer $REVEZO_API_KEY`; bodies are JSON, at most 16 KB.

| Call | Does |
|---|---|
| `GET /v1/admin/state` | Routes, providers with usage and state, available provider types, whether changes are allowed. |
| `POST /v1/admin/routes` | New route: `{ "name", "kind", "strategy" }`. |
| `PATCH /v1/admin/routes/:name` | `{ "strategy" }` and/or `{ "order": [provider names] }`. |
| `DELETE /v1/admin/routes/:name` | Removes an empty route created on the dashboard. |
| `POST /v1/admin/providers` | `{ "route", "use", "name", "options", "limits", "weight", "capabilities" }`. |
| `PATCH /v1/admin/providers/:name` | `{ "paused" }`, and for dashboard providers `{ "limits", "weight", "capabilities" }`. |
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
| `providers[].use` | Provider type (`brevo`, `mailjet`, `smtp`). |
| `providers[].limits` | `perMinute`, `perHour`, `perDay`, `perMonth`. |
| `providers[].capabilities` | Override flags, e.g. `allowsMarketing: true` for an SMTP server that allows it. |

## Use as a library

```ts
import { buildConfig, registerEmailPlugins } from "revezo";

registerEmailPlugins();
const { hub } = buildConfig(myConfigObject);
await hub.send("email-marketing", message, { requires: { allowsMarketing: true } });
```

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
- **next** shared suppression list fed by provider webhooks (bounces, complaints, unsubscribes); queue for "send tomorrow"; Resend, Mailgun, SMTP2GO, Amazon SES plugins.
- **next** listmonk integration guide, Cloudflare Workers deployment.
- **v0.4** LLM routing with token counting and an OpenAI-compatible endpoint (Groq, Cerebras, OpenRouter, Gemini).
- **v0.5** social posting with a "fan-out" strategy (Meta, LinkedIn, Bluesky, Telegram).
- **v1.0** SMS/WhatsApp, cost-based routing with spending caps.

Want a new provider? See [docs/writing-a-plugin.md](docs/writing-a-plugin.md).

## License

[MIT](LICENSE)
