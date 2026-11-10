import type { FeedEvent } from "@cal/api-client";
import { describe, expect, it } from "vitest";
import { applyTodoistOverrides, liveOverrides, OVERRIDE_TTL_MS, stripDoneMark, todoistTaskId, withDoneMark } from "./todoist";

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
