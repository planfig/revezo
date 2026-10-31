import type { Attempt } from "./types.ts";

export interface HubEvent extends Attempt {
  ts: string;
  route: string;
}

/** Keeps the latest attempts in memory for the dashboard. Holds no addresses or content. */
export class EventLog {
  #items: HubEvent[] = [];
  #max: number;

  constructor(max = 200) {
    this.#max = max;
  }

  add(route: string, attempt: Attempt, now = new Date()): void {
    this.#items.push({ ts: now.toISOString(), route, ...attempt });
    if (this.#items.length > this.#max) this.#items.splice(0, this.#items.length - this.#max);
  }

  /** Newest first. */
  list(limit = 50): HubEvent[] {
    return this.#items.slice(-limit).reverse();
  }
}
