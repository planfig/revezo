import { ProviderError } from "../../core/errors.ts";
import { requireString, type Plugin } from "../../core/registry.ts";
import type { Adapter } from "../../core/types.ts";
import { postJson } from "../http.ts";
import { buildHeaders, emailCost, type Address, type EmailMessage, type EmailResult } from "./message.ts";

const URL = "https://api.mailjet.com/v3.1/send";

const toMj = (a: Address) => ({ Email: a.email, Name: a.name });

interface MailjetReply {
  Messages?: { Status?: string; To?: { MessageID?: number | string }[]; Errors?: { ErrorMessage?: string }[] }[];
}

/** Mailjet Send API v3.1. Free plan: 200 e-mails/day, 6,000/month, marketing allowed. */
export const mailjet: Plugin = {
  id: "mailjet",
  kind: "email",
  oneAccountPerRoute: true,
  label: "Mailjet",
  fields: [
    { name: "apiKey", label: "API key", type: "string", required: true, secret: true },
    { name: "apiSecret", label: "Secret key", type: "string", required: true, secret: true },
  ],
  suggestedLimits: { perDay: 200, perMonth: 6000 },
  defaultCapabilities: { allowsMarketing: true },
  create(options, ctx): Adapter<EmailMessage, EmailResult> {
    const key = requireString(options, "apiKey", "mailjet");
    const secret = requireString(options, "apiSecret", "mailjet");
    const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
    return {
      id: "mailjet",
      kind: "email",
      capabilities: { ...mailjet.defaultCapabilities },
      cost: emailCost,
      async send(m, { signal }) {
        const headers = buildHeaders(m);
        const reply = (await postJson(
          ctx.fetch,
          URL,
          { authorization: auth },
          {
            Messages: [
              {
                From: toMj(m.from),
                To: m.to.map(toMj),
                Subject: m.subject,
                TextPart: m.text,
                HTMLPart: m.html,
                ReplyTo: m.replyTo && toMj(m.replyTo),
                Headers: Object.keys(headers).length ? headers : undefined,
              },
            ],
          },
          signal,
        )) as MailjetReply;
        const first = reply.Messages?.[0];
        if (first && first.Status !== "success") {
          const detail = first.Errors?.map((e) => e.ErrorMessage).join("; ") || "unknown error";
          throw new ProviderError("permanent", `Mailjet rejected the message: ${detail}`);
        }
        const id = first?.To?.[0]?.MessageID;
        return { messageId: id === undefined ? undefined : String(id) };
      },
      classifyError(err) {
        return err instanceof ProviderError ? err.kind : "temporary";
      },
    };
  },
};
