import type { FeedEvent, TodoistProject, TodoistTask } from "@cal/api-client";

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

export interface TodoistGroup {
  project: TodoistProject;
  rows: { task: TodoistTask; depth: number }[];
}

// Todoist content is light markdown; the panel shows plain text.
export function plainTaskText(content: string): string {
  return content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]{1,2}([^*_`]+)[*_`]{1,2}/g, "$1");
}

// Groups open tasks by project (inbox first, then Todoist's project order),
// each subtask directly under its parent, siblings in Todoist's order.
export function groupTodoistTasks(tasks: TodoistTask[], projects: TodoistProject[]): TodoistGroup[] {
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string, TodoistTask[]>();
  for (const task of tasks) {
    const key = task.parentId && ids.has(task.parentId) ? task.parentId : `project:${task.projectId}`;
    children.set(key, [...(children.get(key) ?? []), task]);
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order);

  const walk = (key: string, depth: number, rows: TodoistGroup["rows"]) => {
    for (const task of children.get(key) ?? []) {
      rows.push({ task, depth });
      walk(task.id, depth + 1, rows);
    }
    return rows;
  };

  const known = new Map(projects.map((p) => [p.id, p]));
  for (const task of tasks) {
    if (!known.has(task.projectId)) known.set(task.projectId, { id: task.projectId, name: task.projectName || "Other", inbox: false, order: Number.MAX_SAFE_INTEGER });
  }
  return [...known.values()]
    .sort((a, b) => Number(b.inbox) - Number(a.inbox) || a.order - b.order)
    .map((project) => ({ project, rows: walk(`project:${project.id}`, 0, []) }))
    .filter((group) => group.rows.length > 0);
}
