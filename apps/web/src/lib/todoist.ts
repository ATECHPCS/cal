import type { FeedEvent } from "@cal/api-client";

// Todoist tasks arrive through the Google Calendar feed. Each event's
// description holds the task URL, and finished tasks carry a leading check
// mark in the title.

const TASK_URL = /todoist\.com\/(?:app\/task\/(?:[^\s/?#]*-)?|showTask\?id=)([A-Za-z0-9]+)/;
const DONE_MARK = /^\s*[✓✔☑]\s*/u;

// How long a tick made in Cal overrides the feed, while Todoist's change
// travels through Google Calendar back into the feed cache.
export const OVERRIDE_TTL_MS = 2 * 60 * 60 * 1000;

export type TodoistOverrides = Record<string, { done: boolean; at: number }>;

export function todoistTaskId(event: Pick<FeedEvent, "details" | "url">): string | undefined {
  return TASK_URL.exec(event.details ?? "")?.[1] ?? TASK_URL.exec(event.url ?? "")?.[1];
}

export function stripDoneMark(title: string): string {
  return title.replace(DONE_MARK, "");
}

export function withDoneMark(title: string, done: boolean): string {
  const bare = stripDoneMark(title);
  return done ? `✓ ${bare}` : bare;
}

export function liveOverrides(overrides: TodoistOverrides, now: number): TodoistOverrides {
  return Object.fromEntries(Object.entries(overrides).filter(([, o]) => now - o.at < OVERRIDE_TTL_MS));
}

export function applyTodoistOverrides(events: FeedEvent[], overrides: TodoistOverrides): FeedEvent[] {
  if (Object.keys(overrides).length === 0) return events;
  return events.map((event) => {
    const id = todoistTaskId(event);
    const o = id ? overrides[id] : undefined;
    return o ? { ...event, title: withDoneMark(event.title, o.done) } : event;
  });
}
