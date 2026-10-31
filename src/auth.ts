import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

/** Where the dashboard login is kept: a user name and a password hash, never the password. */
export interface CredentialStore {
  getCredentials(): { user: string; hash: string } | undefined;
  setCredentials(user: string, hash: string): void;
}

export const USER_RE = /^[A-Za-z0-9_.@-]{3,64}$/;
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

const SESSION_MS = 12 * 3_600_000;
const MAX_SESSIONS = 100;
const FAIL_WINDOW_MS = 15 * 60_000;
const CAPTCHA_AFTER = 3;
const LOCK_AFTER = 10;
const LOCK_MS = 15 * 60_000;
const CAPTCHA_MS = 5 * 60_000;
const MAX_CAPTCHAS = 1000;
const MAX_TRACKED = 10_000;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${(await scryptAsync(password, salt)).toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; code: "wrong_login" | "captcha_required" | "captcha_wrong"; captcha: boolean }
  | { ok: false; code: "locked"; retryAfterSec: number };

interface Fails {
  count: number;
  first: number;
  lockedUntil: number;
}

/**
 * Dashboard login: user and password (scrypt hash), sessions kept in memory (a restart
 * logs everyone out), a captcha after 3 wrong tries and a 15-minute lock after 10.
 */
export class Auth {
  #store: CredentialStore;
  #now: () => number;
  #sessions = new Map<string, { user: string; expires: number }>();
  #captchas = new Map<string, { answer: string; expires: number }>();
  #fails = new Map<string, Fails>();
  // Compared against when the user name is unknown, so both cases take the same time.
  #dummy = hashPassword(randomBytes(12).toString("hex"));

  constructor(store: CredentialStore, now: () => number = Date.now) {
    this.#store = store;
    this.#now = now;
  }

  hasAdmin(): boolean {
    return this.#store.getCredentials() !== undefined;
  }

  /** Sets (or replaces) the login. The caller checks REVEZO_API_KEY first. Ends all sessions. */
  async setCredentials(user: string, password: string): Promise<string> {
    this.#store.setCredentials(user, await hashPassword(password));
    this.#sessions.clear();
    return this.#newSession(user);
  }

  async login(ip: string, user: string, password: string, captcha?: { id: string; answer: string }): Promise<LoginResult> {
    const locked = this.lockedFor(ip);
    if (locked) return { ok: false, code: "locked", retryAfterSec: locked };
    if (this.needsCaptcha(ip)) {
      if (!captcha?.id) return { ok: false, code: "captcha_required", captcha: true };
      if (!this.#checkCaptcha(captcha.id, captcha.answer)) return this.#fail(ip, "captcha_wrong");
    }
    const creds = this.#store.getCredentials();
    const ok = await verifyPassword(password, creds?.hash ?? (await this.#dummy));
    if (!creds || !ok || creds.user !== user) return this.#fail(ip, "wrong_login");
    this.#fails.delete(ip);
    return { ok: true, token: this.#newSession(user) };
  }

  /** Counts a failed attempt that was not a login (e.g. a wrong REVEZO_API_KEY on setup). */
  recordFailure(ip: string): void {
    this.#fail(ip, "wrong_login");
  }

  clearFailures(ip: string): void {
    this.#fails.delete(ip);
  }

  /** The user of a valid session token, extending it; undefined otherwise. */
  session(token: string | undefined): string | undefined {
    if (!token) return undefined;
    const s = this.#sessions.get(token);
    if (!s) return undefined;
    if (s.expires <= this.#now()) {
      this.#sessions.delete(token);
      return undefined;
    }
    s.expires = this.#now() + SESSION_MS;
    return s.user;
  }

  logout(token: string | undefined): void {
    if (token) this.#sessions.delete(token);
  }

  needsCaptcha(ip: string): boolean {
    return (this.#recentFails(ip)?.count ?? 0) >= CAPTCHA_AFTER;
  }

  /** Seconds left on a lock, 0 when not locked. */
  lockedFor(ip: string): number {
    const f = this.#fails.get(ip);
    const left = f ? f.lockedUntil - this.#now() : 0;
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  newCaptcha(): string {
    const now = this.#now();
    for (const [id, c] of this.#captchas) if (c.expires <= now || this.#captchas.size >= MAX_CAPTCHAS) this.#captchas.delete(id);
    const id = randomBytes(16).toString("hex");
    let answer = "";
    for (let i = 0; i < 5; i++) answer += ALPHABET[randomInt(ALPHABET.length)];
    this.#captchas.set(id, { answer, expires: now + CAPTCHA_MS });
    return id;
  }

  /** The captcha drawn as an SVG made only of paths, so its text cannot be read from the file. */
  captchaSvg(id: string): string | undefined {
    const c = this.#captchas.get(id);
    return c && c.expires > this.#now() ? drawCaptcha(c.answer) : undefined;
  }

  /** For tests only. */
  captchaAnswer(id: string): string | undefined {
    return this.#captchas.get(id)?.answer;
  }

  #checkCaptcha(id: string, answer: string): boolean {
    const c = this.#captchas.get(id);
    this.#captchas.delete(id); // one try per captcha
    return !!c && c.expires > this.#now() && typeof answer === "string" && answer.trim().toUpperCase() === c.answer;
  }

  #recentFails(ip: string): Fails | undefined {
    const f = this.#fails.get(ip);
    if (f && f.lockedUntil <= this.#now() && this.#now() - f.first > FAIL_WINDOW_MS) {
      this.#fails.delete(ip);
      return undefined;
    }
    return f;
  }

  #fail(ip: string, code: "wrong_login" | "captcha_wrong"): LoginResult {
    const now = this.#now();
    if (this.#fails.size >= MAX_TRACKED && !this.#fails.has(ip)) this.#fails.delete(this.#fails.keys().next().value!);
    const f = this.#recentFails(ip) ?? { count: 0, first: now, lockedUntil: 0 };
    f.count++;
    if (f.count >= LOCK_AFTER) {
      f.lockedUntil = now + LOCK_MS;
      f.count = CAPTCHA_AFTER; // after the lock, the captcha is still asked
      f.first = now;
    }
    this.#fails.set(ip, f);
    if (f.lockedUntil > now) return { ok: false, code: "locked", retryAfterSec: Math.ceil((f.lockedUntil - now) / 1000) };
    return { ok: false, code, captcha: f.count >= CAPTCHA_AFTER };
  }

  #newSession(user: string): string {
    if (this.#sessions.size >= MAX_SESSIONS) this.#sessions.delete(this.#sessions.keys().next().value!);
    const token = randomBytes(32).toString("base64url");
    this.#sessions.set(token, { user, expires: this.#now() + SESSION_MS });
    return token;
  }
}

// Letters that are hard to confuse, each drawn as strokes on a 4×6 grid.
const GLYPHS: Record<string, number[][][]> = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 3.5], [3, 3.5]]],
  C: [[[4, 0.5], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5.5]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.5]], [[1.5, 2.6], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 3], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  "3": [[[0, 0], [4, 0], [2, 2.5], [4, 4], [3, 6], [0, 6]]],
  "4": [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  "7": [[[0, 0], [4, 0], [1.5, 6]]],
};
const ALPHABET = Object.keys(GLYPHS).join("");

function drawCaptcha(text: string): string {
  const W = 170, H = 60;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = `M${rnd(0, W).toFixed(1)},${rnd(0, H).toFixed(1)} C${rnd(0, W).toFixed(1)},${rnd(0, H).toFixed(1)} ${rnd(0, W).toFixed(1)},${rnd(0, H).toFixed(1)} ${rnd(0, W).toFixed(1)},${rnd(0, H).toFixed(1)}`;
    parts.push(`<path d="${d}" stroke="#7d8f8b" stroke-width="${rnd(1, 2.2).toFixed(1)}" fill="none"/>`);
  }
  [...text].forEach((ch, i) => {
    const sx = rnd(5.2, 6.6), sy = rnd(6, 7.4), ang = (rnd(-20, 20) * Math.PI) / 180;
    const cx = 22 + i * 31 + rnd(-3, 3), cy = H / 2 + rnd(-4, 4);
    const pt = ([x, y]: number[]) => {
      const px = (x - 2 + rnd(-0.25, 0.25)) * sx, py = (y - 3 + rnd(-0.25, 0.25)) * sy;
      return `${(cx + px * Math.cos(ang) - py * Math.sin(ang)).toFixed(1)},${(cy + px * Math.sin(ang) + py * Math.cos(ang)).toFixed(1)}`;
    };
    const d = GLYPHS[ch].map((stroke) => "M" + stroke.map(pt).join(" L")).join(" ");
    const color = ["#123f3a", "#3a2470", "#5a2a08", "#103060"][randomInt(4)];
    parts.push(`<path d="${d}" stroke="${color}" stroke-width="${rnd(2.6, 3.4).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="6" fill="#eef3f2"/>${parts.join("")}</svg>`;
}
