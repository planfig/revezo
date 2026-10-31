# Security

Please report vulnerabilities privately through GitHub's "Report a vulnerability"
button on this repository, not in a public issue.

## Keeping secrets out of the repository

- Credentials live only in `.env` (ignored) and are referenced from the config as `${NAME}`.
- `revezo.config.yaml`, `*.local.*`, databases and logs are ignored.
- `npm run check:secrets` scans tracked files for API keys and for any word listed in
  your private `.secrets-denylist` (one word per line, ignored by git). The pre-commit
  hook runs it on staged files, and CI runs gitleaks on every push.

## What the server protects against

| Risk | Protection |
|---|---|
| Someone else using your quotas | Every `/v1/*` call needs `REVEZO_API_KEY` (at least 24 characters), compared in constant time. Without a key the server refuses to listen beyond `127.0.0.1`. |
| Exposed by accident | Listens on `127.0.0.1` unless `host`/`HOST` says otherwise. |
| Header injection (hidden Bcc, spoofed From) | Subjects, names and header values may not contain line breaks; callers may only add `X-...` and a few harmless headers. |
| Oversized requests | Bodies over 1 MB are refused; at most 50 recipients per message. |
| Duplicate e-mails after a timeout | `Idempotency-Key` support. |
| Prompts and answers | `/v1/chat/completions` keeps neither: logs and the dashboard only see route, provider and outcome. Messages are checked (roles, text only, at most 200 messages and 400,000 characters). |
| Personal data in logs | Logs and the dashboard carry provider names, outcomes and counts. E-mail addresses and phone numbers in provider error text are replaced by `[email]` / `[number]`. |
| Guessing the dashboard login | User and password (scrypt hash, never stored in clear). Captcha after 3 wrong tries, 15-minute lock after 10, per address. The session lives in an `HttpOnly`, `SameSite=Strict` cookie for 12 hours of inactivity; changes made with it also need the `X-Revezo-Panel` header, so other sites cannot trigger them. Setting or resetting the login needs `REVEZO_API_KEY`. |
| Dashboard attacks (XSS, clickjacking) | Strict Content-Security-Policy with a per-request nonce for the one script and the one stylesheet, no inline style attributes or event handlers, `X-Frame-Options: DENY`, data written as text only, no key kept in the browser. |
| API keys added on the dashboard | Stored in `storage.sqlite` encrypted with AES-256-GCM. The key is derived from `REVEZO_SECRETS_KEY` (at least 24 characters) with scrypt and a random salt; each value is bound to its provider name. A wrong key stops the server at start instead of loading garbage. |
| Secrets leaking through the API | No route returns option values: `/v1/admin/state` only says whether each secret field is set. Error messages name fields, never values. |
| Changes by someone without the key | Every `/v1/admin/*` change needs `REVEZO_API_KEY`. Without it, without `REVEZO_SECRETS_KEY` or with in-memory storage, the dashboard is read only and says why. |
| Bad management input | Unknown fields are refused; names, limits, weights and options are checked against the plugin's field list; bodies over 16 KB are refused; at most 50 routes and 100 providers. |
| Breaking provider terms | One account per provider per route (`oneAccountPerRoute`) and unique provider names are enforced on the dashboard too. |
| Container escape impact | The Docker image runs as the unprivileged `node` user. |
| Vulnerable dependencies | `npm audit` in CI and weekly Dependabot updates. |

## Known limits

- Behind a reverse proxy every visitor shares the proxy address, so one attacker can lock
  the login for everyone for 15 minutes; `X-Forwarded-For` is not trusted on purpose.
- The captcha has no audio version.

- Whoever has `REVEZO_API_KEY` can add providers, including an SMTP host or an Ollama
  address of their choice that the server will connect to. Treat the key like an admin password.
- `REVEZO_SECRETS_KEY` protects a copied database file, not a compromised server: the
  running process holds the keys in memory to send mail. Back the key up apart from the
  database; losing it means adding the dashboard's providers again.

- The dashboard and API use plain HTTP. Put Revezo behind HTTPS (a reverse proxy or your
  host's TLS) before exposing it to the internet.
- Idempotency keys are kept in memory and forgotten on restart.
- If a provider accepts a message but the answer is lost (network cut), Revezo may try the
  next provider. Use `Idempotency-Key` on the client side and keep retries low for
  marketing sends.
