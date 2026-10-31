# Revezo

Open source hub that routes API calls across several providers of the same kind.
It counts each provider's quota (per minute, hour, day, month), and when one runs out
or fails, it moves to the next one.

The first plugin family is **e-mail** (Brevo, Mailjet, any SMTP server). The core knows
nothing about e-mail, so the same hub is meant for LLM APIs, social posting, SMS and more.

> Status: early MVP (v0.2). E-mail routing works; suppression lists, queueing and
> more provider types are on the [roadmap](#roadmap).

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
latest attempts. `GET /health` needs no key.

### Avoiding double sends

If your client retries after a timeout, send an `Idempotency-Key` header (8–128 letters,
digits, `_ . : -`). A repeat with the same key and message gets the first answer instead of
a second e-mail; the same key with a different message gets `409`. Keys are remembered in
memory for 24 hours.

## Dashboard

Open `http://localhost:8787/dashboard` and paste your `REVEZO_API_KEY`. It shows, for each
route, how much of each provider's quota is used today and this month, which providers are
paused and until when, and the latest attempts. The key stays only in that browser tab.
The page is in English or Portuguese, following the browser language.

## Configuration

See [revezo.config.example.yaml](revezo.config.example.yaml). Credentials are written as
`${NAME}` and read from the environment, so the config file itself holds no secrets.

| Field | Meaning |
|---|---|
| `server.host` | `127.0.0.1` (default, this machine only) or `0.0.0.0`. Env `HOST` overrides it; the Docker image uses `0.0.0.0`. |
| `server.port` | Default `8787`. Env `PORT` overrides it. |
| `timezone` | When daily and monthly counters reset (default `UTC`). |
| `storage.sqlite` | Path of the counters database. Omit to keep counters in memory. |
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

- **v0.2** shared suppression list fed by provider webhooks (bounces, complaints, unsubscribes); queue for "send tomorrow"; Resend, Mailgun, SMTP2GO, Amazon SES plugins.
- **v0.3** listmonk integration guide, small dashboard, Cloudflare Workers deployment.
- **v0.4** LLM routing with token counting and an OpenAI-compatible endpoint (Groq, Cerebras, OpenRouter, Gemini).
- **v0.5** social posting with a "fan-out" strategy (Meta, LinkedIn, Bluesky, Telegram).
- **v1.0** SMS/WhatsApp, cost-based routing with spending caps.

Want a new provider? See [docs/writing-a-plugin.md](docs/writing-a-plugin.md).

## License

[MIT](LICENSE)
