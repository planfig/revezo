import { ProviderError } from "../../core/errors.ts";
import { requireString, type Plugin } from "../../core/registry.ts";
import type { Adapter } from "../../core/types.ts";
import { postJson } from "../http.ts";
import { buildHeaders, emailCost, type EmailMessage, type EmailResult } from "./message.ts";

const URL = "https://api.brevo.com/v3/smtp/email";

/** Brevo transactional API. Free plan: 300 e-mails/day, marketing allowed. */
export const brevo: Plugin = {
  id: "brevo",
  kind: "email",
  oneAccountPerRoute: true,
  label: "Brevo",
  fields: [{ name: "apiKey", label: "API key", type: "string", required: true, secret: true }],
  suggestedLimits: { perDay: 300 },
  defaultCapabilities: { allowsMarketing: true },
  create(options, ctx): Adapter<EmailMessage, EmailResult> {
    const apiKey = requireString(options, "apiKey", "brevo");
    return {
      id: "brevo",
      kind: "email",
      capabilities: { ...brevo.defaultCapabilities },
      cost: emailCost,
      async send(m, { signal }) {
        const headers = buildHeaders(m);
        const reply = (await postJson(
          ctx.fetch,
          URL,
          { "api-key": apiKey },
          {
            sender: m.from,
            to: m.to,
            subject: m.subject,
            htmlContent: m.html,
            textContent: m.text,
            replyTo: m.replyTo,
            headers: Object.keys(headers).length ? headers : undefined,
          },
          signal,
        )) as { messageId?: string };
        return { messageId: reply.messageId };
      },
      classifyError(err) {
        return err instanceof ProviderError ? err.kind : "temporary";
      },
    };
  },
};
