import nodemailer from "nodemailer";
import { ConfigError } from "../../core/errors.ts";
import { requireString, type Plugin } from "../../core/registry.ts";
import type { Adapter, ErrorKind } from "../../core/types.ts";
import { buildHeaders, emailCost, type Address, type EmailMessage, type EmailResult } from "./message.ts";

const fmt = (a: Address) => (a.name ? { name: a.name, address: a.email } : a.email);

/**
 * Any SMTP server. Works with most providers' SMTP relays.
 * Whether marketing is allowed depends on the server: set capabilities.allowsMarketing in the config.
 */
export const smtp: Plugin = {
  id: "smtp",
  kind: "email",
  oneAccountPerRoute: false,
  label: "SMTP",
  fields: [
    { name: "host", label: "Host", type: "string", required: true, secret: false },
    { name: "port", label: "Port", type: "number", required: false, secret: false },
    { name: "user", label: "User", type: "string", required: false, secret: false },
    { name: "pass", label: "Password", type: "string", required: false, secret: true },
    { name: "secure", label: "TLS from the start (port 465)", type: "boolean", required: false, secret: false },
  ],
  suggestedLimits: {},
  defaultCapabilities: { allowsMarketing: false },
  create(options): Adapter<EmailMessage, EmailResult> {
    const host = requireString(options, "host", "smtp");
    const port = Number(options.port ?? 587);
    if (!Number.isInteger(port) || port <= 0) throw new ConfigError('Provider "smtp" option "port" must be a number');
    const user = options.user === undefined ? undefined : requireString(options, "user", "smtp");
    const pass = options.pass === undefined ? undefined : requireString(options, "pass", "smtp");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: options.secure === true || port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    return {
      id: "smtp",
      kind: "email",
      capabilities: { ...smtp.defaultCapabilities },
      cost: emailCost,
      async send(m) {
        const info = await transport.sendMail({
          from: fmt(m.from),
          to: m.to.map(fmt),
          replyTo: m.replyTo && fmt(m.replyTo),
          subject: m.subject,
          html: m.html,
          text: m.text,
          headers: buildHeaders(m),
        });
        return { messageId: info.messageId };
      },
      classifyError: classifySmtp,
    };
  },
};

export function classifySmtp(err: unknown): ErrorKind {
  const e = err as { code?: string; responseCode?: number; response?: string };
  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) return "auth";
  const code = e.responseCode;
  if (code === 452 || code === 451 || code === 421) {
    return /quota|limit|exceeded|too many/i.test(e.response ?? "") ? "quota" : "temporary";
  }
  if (code !== undefined && code >= 500) {
    return /quota|limit exceeded|daily/i.test(e.response ?? "") ? "quota" : "permanent";
  }
  return "temporary";
}
