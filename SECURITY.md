# Security

Please report vulnerabilities privately through GitHub's "Report a vulnerability"
button on this repository, not in a public issue.

## Keeping secrets out of the repository

- Credentials live only in `.env` (ignored) and are referenced from the config as `${NAME}`.
- `revezo.config.yaml`, `*.local.*`, databases and logs are ignored.
- `npm run check:secrets` scans tracked files for API keys and for any word listed in
  your private `.secrets-denylist` (one word per line, ignored by git). The pre-commit
  hook runs it on staged files, and CI runs gitleaks on every push.
- Logs never contain recipient addresses or message bodies, only counts.
