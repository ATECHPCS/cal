import type { FeedEvent } from "@cal/api-client";
import { describe, expect, it } from "vitest";
import {
  applyTodoistOverrides,
  groupTodoistTasks,
  liveOverrides,
  OVERRIDE_TTL_MS,
  plainTaskText,
  stripDoneMark,
  todoistTaskId,
  withDoneMark,
} from "./todoist";

const ev = (title: string, details?: string): FeedEvent => ({
  id: title,
  feedId: "f",
  feedName: "Todoist",
  title,
  date: "2026-11-10",
  color: "orange",
  details,
});

describe("todoist", () => {
  it("reads the task id from the description", () => {
    expect(todoistTaskId(ev("x", "https://app.todoist.com/app/task/6h5cp884FpfgVjJC"))).toBe("6h5cp884FpfgVjJC");
    expect(todoistTaskId(ev("x", "https://app.todoist.com/app/task/drain-tank-6hM99QJx"))).toBe("6hM99QJx");
    expect(todoistTaskId(ev("x", "https://todoist.com/showTask?id=12345"))).toBe("12345");
    expect(todoistTaskId(ev("x", "Team sync notes"))).toBeUndefined();
  });

  it("adds and removes the done mark", () => {
    expect(withDoneMark("Pay rent", true)).toBe("✓ Pay rent");
    expect(withDoneMark("✓ Pay rent", false)).toBe("Pay rent");
    expect(withDoneMark("✓ Pay rent", true)).toBe("✓ Pay rent");
    expect(stripDoneMark("✔ Pay rent")).toBe("Pay rent");
  });

  it("applies overrides to matching tasks only", () => {
    const events = [ev("Pay rent", "https://app.todoist.com/app/task/abc"), ev("Standup")];
    const out = applyTodoistOverrides(events, { abc: { done: true, at: 0 } });
    expect(out.map((e) => e.title)).toEqual(["✓ Pay rent", "Standup"]);
  });

  it("expires old overrides", () => {
    const now = 10 * OVERRIDE_TTL_MS;
    expect(Object.keys(liveOverrides({ old: { done: true, at: now - OVERRIDE_TTL_MS }, fresh: { done: true, at: now - 1 } }, now))).toEqual(
      ["fresh"],
    );
  });
});

describe("groupTodoistTasks", () => {
  const task = (id: string, projectId: string, order: number, parentId?: string) => ({ id, content: id, projectId, projectName: "", order, priority: 1, parentId });
  const projects = [
    { id: "shop", name: "Shop", inbox: false, order: 2 },
    { id: "home", name: "Home", inbox: false, order: 1 },
    { id: "in", name: "Inbox", inbox: true, order: 0 },
  ];

  it("puts the inbox first, then project order, subtasks under their parent", () => {
    const groups = groupTodoistTasks(
      [task("b", "home", 2), task("a", "home", 1), task("a2", "home", 1, "a"), task("x", "shop", 0), task("i", "in", 0)],
      projects,
    );
    expect(groups.map((g) => g.project.name)).toEqual(["Inbox", "Home", "Shop"]);
    expect(groups[1].rows.map((r) => `${r.task.id}:${r.depth}`)).toEqual(["a:0", "a2:1", "b:0"]);
  });

  it("keeps orphaned subtasks at the top level", () => {
    const groups = groupTodoistTasks([task("c", "home", 0, "gone")], projects);
    expect(groups[0].rows.map((r) => r.depth)).toEqual([0]);
  });
});

describe("plainTaskText", () => {
  it("strips markdown links and emphasis", () => {
    expect(plainTaskText("Read [the guide](https://x.y) **today**")).toBe("Read the guide today");
  });
});
