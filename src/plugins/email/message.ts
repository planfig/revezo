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
// Line breaks or other control characters in a header value let a caller inject extra headers.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
// Callers may add their own X-... headers plus a few harmless standard ones. Routing headers
// (To, Cc, Bcc, From, Sender...) stay under Revezo's control.
const HEADER_NAME_RE = /^X-[A-Za-z0-9-]{1,64}$/;
const ALLOWED_HEADERS = new Set(["list-id", "precedence", "references", "in-reply-to", "message-id", "feedback-id"]);
const MAX_SUBJECT = 998;
const MAX_BODY_CHARS = 512_000;

/** Returns a list of problems; empty means the message is valid. */
export function validateEmail(input: unknown): string[] {
  const m = input as Partial<EmailMessage> | null;
  const errors: string[] = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["body must be a JSON object"];
  if (!m.from || !isAddress(m.from)) errors.push("from.email must be a valid address");
  if (!Array.isArray(m.to) || m.to.length === 0) errors.push("to must be a non-empty list");
  else if (m.to.some((a) => !isAddress(a))) errors.push("every to[].email must be a valid address");
  else if (m.to.length > 50) errors.push("at most 50 recipients per message; send one message per recipient for campaigns");
  if (typeof m.subject !== "string" || !m.subject.trim()) errors.push("subject is required");
  else if (m.subject.length > MAX_SUBJECT || CONTROL_RE.test(m.subject)) errors.push("subject is too long or has line breaks");
  if (!m.html && !m.text) errors.push("html or text is required");
  for (const field of ["html", "text"] as const) {
    const v = m[field];
    if (v !== undefined && (typeof v !== "string" || v.length > MAX_BODY_CHARS)) errors.push(`${field} must be text up to ${MAX_BODY_CHARS} characters`);
  }
  if (m.replyTo !== undefined && !isAddress(m.replyTo)) errors.push("replyTo.email must be a valid address");
  if (m.headers !== undefined) {
    if (!m.headers || typeof m.headers !== "object" || Array.isArray(m.headers)) errors.push("headers must be an object");
    else {
      for (const [name, value] of Object.entries(m.headers)) {
        if (!HEADER_NAME_RE.test(name) && !ALLOWED_HEADERS.has(name.toLowerCase())) {
          errors.push(`header "${name.slice(0, 40)}" is not allowed; use X-... names`);
        } else if (typeof value !== "string" || value.length > 998 || CONTROL_RE.test(value)) {
          errors.push(`header "${name}" must be one line of text`);
        }
      }
    }
  }
  if (m.category !== undefined && m.category !== "marketing" && m.category !== "transactional") {
    errors.push('category must be "marketing" or "transactional"');
  }
  if (m.category === "marketing" && !m.unsubscribeUrl) errors.push("marketing messages need unsubscribeUrl");
  if (m.unsubscribeUrl !== undefined && !isHttpsUrl(m.unsubscribeUrl)) errors.push("unsubscribeUrl must be an https:// address");
  return errors;
}

function isAddress(a: unknown): a is Address {
  if (!a || typeof a !== "object") return false;
  const { email, name } = a as Address;
  if (typeof email !== "string" || email.length > 254 || !EMAIL_RE.test(email)) return false;
  return name === undefined || (typeof name === "string" && name.length <= 200 && !CONTROL_RE.test(name));
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2000 || /[\s<>]/.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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
