export interface Address {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: Address;
  to: Address[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: Address;
  headers?: Record<string, string>;
  /** Marketing messages only go through providers whose terms allow marketing on the plan in use. */
  category?: "marketing" | "transactional";
  /** Adds List-Unsubscribe and one-click headers, required by Gmail/Yahoo for bulk mail. */
  unsubscribeUrl?: string;
}

export interface EmailResult {
  messageId?: string;
}

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/** Returns a list of problems; empty means the message is valid. */
export function validateEmail(input: unknown): string[] {
  const m = input as Partial<EmailMessage> | null;
  const errors: string[] = [];
  if (!m || typeof m !== "object") return ["body must be a JSON object"];
  if (!m.from || !isAddress(m.from)) errors.push("from.email must be a valid address");
  if (!Array.isArray(m.to) || m.to.length === 0) errors.push("to must be a non-empty list");
  else if (m.to.some((a) => !isAddress(a))) errors.push("every to[].email must be a valid address");
  else if (m.to.length > 50) errors.push("at most 50 recipients per message; send one message per recipient for campaigns");
  if (typeof m.subject !== "string" || !m.subject.trim()) errors.push("subject is required");
  if (!m.html && !m.text) errors.push("html or text is required");
  if (m.replyTo !== undefined && !isAddress(m.replyTo)) errors.push("replyTo.email must be a valid address");
  if (m.category !== undefined && m.category !== "marketing" && m.category !== "transactional") {
    errors.push('category must be "marketing" or "transactional"');
  }
  if (m.category === "marketing" && !m.unsubscribeUrl) errors.push("marketing messages need unsubscribeUrl");
  if (m.unsubscribeUrl !== undefined && !/^https:\/\//.test(m.unsubscribeUrl)) errors.push("unsubscribeUrl must start with https://");
  return errors;
}

function isAddress(a: unknown): a is Address {
  return !!a && typeof a === "object" && typeof (a as Address).email === "string" && EMAIL_RE.test((a as Address).email);
}

/** Message headers including the unsubscribe headers when an unsubscribe URL is set. */
export function buildHeaders(m: EmailMessage): Record<string, string> {
  const headers = { ...m.headers };
  if (m.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${m.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return headers;
}

/** Each recipient counts against the quota, as most providers do. */
export function emailCost(m: EmailMessage) {
  return { unit: "email", amount: m.to.length };
}
