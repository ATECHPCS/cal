import type { Entry, FeedEvent } from "@cal/api-client";
import { timeToMinutes } from "./date";
import type { PersonOccurrence } from "./people";

// One day's calendar contents as a single ordered list, so the month view can
// interleave the user's own entries, synced feed events and birthdays by time
// instead of stacking each source in its own block.

export type DayItem =
  | { kind: "person"; key: string; allDay: true; person: PersonOccurrence }
  | { kind: "entry"; key: string; allDay: boolean; entry: Entry }
  | {
      kind: "feed";
      key: string;
      allDay: boolean;
      event: FeedEvent;
      /** Every feed carrying this same event (first = `event`); length > 1 means collapsed duplicates. */
      copies: FeedEvent[];
    };

/** Same title + same time slot on the same day = one real-world event shown on several calendars. */
function feedKey(event: FeedEvent): string {
  const title = event.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${title}|${event.startTime ?? ""}|${event.endTime ?? ""}`;
}

export function dedupeFeedEvents(events: FeedEvent[]): { event: FeedEvent; copies: FeedEvent[] }[] {
  const groups = new Map<string, FeedEvent[]>();
  for (const event of events) {
    const key = feedKey(event);
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.values()].map((copies) => ({ event: copies[0], copies }));
}

// Rank inside a group of equal start times: birthdays, then own entries, then feeds.
const kindRank = { person: 0, entry: 1, feed: 2 } as const;

export function buildDayItems(entries: Entry[], feedEvents: FeedEvent[], people: PersonOccurrence[]): DayItem[] {
  const items: (DayItem & { order: number; start: number })[] = [];
  let order = 0;
  for (const person of people) {
    items.push({ kind: "person", key: `p:${person.id}`, allDay: true, person, order: order++, start: -1 });
  }
  for (const entry of entries) {
    const start = timeToMinutes(entry.startTime);
    items.push({ kind: "entry", key: `e:${entry.id}`, allDay: start === undefined, entry, order: order++, start: start ?? -1 });
  }
  for (const { event, copies } of dedupeFeedEvents(feedEvents)) {
    const start = timeToMinutes(event.startTime);
    items.push({ kind: "feed", key: `f:${event.id}`, allDay: start === undefined, event, copies, order: order++, start: start ?? -1 });
  }
  // All-day items (start -1) lead, then timed items by start time. Input order
  // breaks the remaining ties, so callers' own sorting (e.g. createdAt) holds.
  items.sort((a, b) => a.start - b.start || kindRank[a.kind] - kindRank[b.kind] || a.order - b.order);
  return items.map(({ order: _order, start: _start, ...item }) => item as DayItem);
}

/**
 * How many items to render in a cell that has room for `capacity` rows.
 * When everything fits, show it all; otherwise keep one row for "+N more".
 */
export function visibleCount(total: number, capacity: number): number {
  if (total <= capacity) return total;
  return Math.max(0, capacity - 1);
}
