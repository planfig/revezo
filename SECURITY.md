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
| Personal data in logs | Logs and the dashboard carry provider names, outcomes and counts. E-mail addresses and phone numbers in provider error text are replaced by `[email]` / `[number]`. |
| Dashboard attacks (XSS, clickjacking) | Strict Content-Security-Policy with a per-request nonce, `X-Frame-Options: DENY`, data written as text only, key kept in `sessionStorage`. |
| Container escape impact | The Docker image runs as the unprivileged `node` user. |
| Vulnerable dependencies | `npm audit` in CI and weekly Dependabot updates. |

## Known limits

- The dashboard and API use plain HTTP. Put Revezo behind HTTPS (a reverse proxy or your
  host's TLS) before exposing it to the internet.
- Idempotency keys are kept in memory and forgotten on restart.
- If a provider accepts a message but the answer is lost (network cut), Revezo may try the
  next provider. Use `Idempotency-Key` on the client side and keep retries low for
  marketing sends.
