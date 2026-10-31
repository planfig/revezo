import type { Attempt } from "./types.ts";

export interface HubEvent extends Attempt {
  /** Grows by one per event, so clients can ask only for what is new (?since=id). */
  id: number;
  ts: string;
  route: string;
}

/** Keeps the latest attempts in memory for the dashboard. Holds no addresses or content. */
export class EventLog {
  #items: HubEvent[] = [];
  #max: number;
  #lastId = 0;

  constructor(max = 200) {
    this.#max = max;
  }

  add(route: string, attempt: Attempt, now = new Date()): void {
    this.#items.push({ id: ++this.#lastId, ts: now.toISOString(), route, ...attempt });
    if (this.#items.length > this.#max) this.#items.splice(0, this.#items.length - this.#max);
  }

  /** Id of the newest event, 0 when there is none. */
  get lastId(): number {
    return this.#lastId;
  }

  /** Newest first. With `since`, only events newer than that id. */
  list(limit = 50, since?: number): HubEvent[] {
    const items = since === undefined ? this.#items : this.#items.filter((e) => e.id > since);
    return items.slice(-limit).reverse();
  }
}
