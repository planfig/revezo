# Writing a plugin

A plugin teaches Revezo to talk to one provider of one kind of API.
Look at [src/plugins/email/brevo.ts](../src/plugins/email/brevo.ts) for a complete example.

```ts
import { ProviderError } from "../../core/errors.ts";
import { requireString, type Plugin } from "../../core/registry.ts";
import { postJson } from "../http.ts";

export const myProvider: Plugin = {
  id: "my-provider",          // used in the config as `use: my-provider`
  kind: "email",              // the route kind it serves
  oneAccountPerRoute: true,   // true if the provider's terms forbid stacking accounts
  // Optional, but needed to add the provider from the dashboard:
  label: "My Provider",
  fields: [{ name: "apiKey", label: "API key", type: "string", required: true, secret: true }],
  suggestedLimits: { perDay: 100 },          // the free plan, offered as defaults
  defaultCapabilities: { allowsMarketing: false },
  create(options, ctx) {
    const apiKey = requireString(options, "apiKey", "my-provider");
    return {
      id: "my-provider",
      kind: "email",
      capabilities: { allowsMarketing: false },
      cost: (msg) => ({ unit: "email", amount: msg.to.length }),
      async send(msg, { signal }) {
        const reply = await postJson(ctx.fetch, "https://api.example.com/send", { authorization: `Bearer ${apiKey}` }, msg, signal);
        return { messageId: (reply as { id?: string }).id };
      },
      classifyError: (err) => (err instanceof ProviderError ? err.kind : "temporary"),
    };
  },
};
```

## Error kinds

Throw a `ProviderError` (or let `postJson` do it) with the kind that tells the router what to do:

| Kind | Router reaction |
|---|---|
| `quota` | Skip this provider until its counter resets (daily by default). |
| `rate_limit` | Skip for `Retry-After`, or one minute. |
| `temporary` | Retry the same provider (up to `maxAttempts`), then move on. |
| `auth` | Skip for one hour; check the credentials. |
| `permanent` | Stop. The request itself is wrong and other providers would refuse it too. |

## Checklist

- Register it in the family's `index.ts`.
- Describe every option in `fields` and mark keys and passwords `secret: true`: secret
  values are stored encrypted and the API only says whether they are set.
- Add a test with a fake `fetch`: one success, one quota error.
- Use only `example.com` addresses and fake keys in tests.
- Document the free plan limits you found, with the date, in the pull request.
