export interface StoredResponse {
  status: number;
  body: unknown;
}

interface Entry {
  expires: number;
  fingerprint: string;
  response: Promise<StoredResponse>;
}

const TTL_MS = 24 * 3_600_000;
const MAX_ENTRIES = 10_000;

/**
 * Remembers responses by Idempotency-Key for 24 hours, so a client that retries after a
 * timeout gets the first answer instead of sending the e-mail twice. In memory only:
 * a restart forgets the keys.
 */
export class IdempotencyCache {
  #entries = new Map<string, Entry>();
  #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * Runs fn once per key. A repeat with the same key and body gets the same response
   * (waiting for it if the first call is still running); a different body gets null.
   */
  run(key: string, fingerprint: string, fn: () => Promise<StoredResponse>): Promise<StoredResponse> | null {
    const now = this.#now();
    const found = this.#entries.get(key);
    if (found && found.expires > now) return found.fingerprint === fingerprint ? found.response : null;

    const response = fn().then(
      (r) => {
        // Only final answers are kept; "try again later" answers may be retried for real.
        if (r.status >= 500) this.#entries.delete(key);
        return r;
      },
      (err) => {
        this.#entries.delete(key);
        throw err;
      },
    );
    this.#entries.set(key, { expires: now + TTL_MS, fingerprint, response });
    this.#prune(now);
    return response;
  }

  #prune(now: number) {
    if (this.#entries.size <= MAX_ENTRIES) return;
    for (const [k, e] of this.#entries) {
      if (e.expires <= now || this.#entries.size > MAX_ENTRIES) this.#entries.delete(k);
      else break;
    }
  }
}
