/**
 * Answers kept in memory for a while, so an identical AI request does not spend quota
 * again. Oldest entries go first when full; a restart empties it.
 */
export class ResponseCache<T> {
  #items = new Map<string, { expires: number; value: T }>();
  #max: number;
  #now: () => number;

  constructor(max = 1000, now: () => number = Date.now) {
    this.#max = max;
    this.#now = now;
  }

  get(key: string): T | undefined {
    const hit = this.#items.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.#now()) {
      this.#items.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.#items.delete(key);
    this.#items.set(key, { expires: this.#now() + ttlMs, value });
    while (this.#items.size > this.#max) this.#items.delete(this.#items.keys().next().value!);
  }

  get size(): number {
    return this.#items.size;
  }
}
