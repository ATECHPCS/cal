import type { Entry, FeedEvent } from "@cal/api-client";
import { describe, expect, it } from "vitest";
import { buildDayItems, dedupeFeedEvents, visibleCount } from "./dayItems";
import type { PersonOccurrence } from "./people";

const entry = (over: Partial<Entry>): Entry => ({
  id: "e1",
  title: "Task",
  type: "task",
  date: "2026-10-17",
  completed: false,
  pinned: false,
  color: "mint",
  tags: [],
  recur: "none",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

const feed = (over: Partial<FeedEvent>): FeedEvent => ({
  id: "f1",
  feedId: "g1",
  feedName: "Google",
  title: "Meeting",
  date: "2026-10-17",
  color: "sky",
  ...over,
});

const person: PersonOccurrence = { id: "p1", personId: "x", name: "Ada", label: "birthday", date: "2026-10-17", color: "rose" };

describe("buildDayItems", () => {
  it("interleaves entries and feed events by start time, all-day first", () => {
    const items = buildDayItems(
      [entry({ id: "late", startTime: "15:00" }), entry({ id: "allday" })],
      [feed({ id: "early", startTime: "09:00" }), feed({ id: "fall" })],
      [person],
    );
    expect(items.map((i) => i.key)).toEqual(["p:p1", "e:allday", "f:fall", "f:early", "e:late"]);
    expect(items.map((i) => i.allDay)).toEqual([true, true, true, false, false]);
  });

  it("puts own entries before feed events at the same time", () => {
    const items = buildDayItems([entry({ id: "mine", startTime: "10:00" })], [feed({ id: "theirs", startTime: "10:00" })], []);
    expect(items.map((i) => i.key)).toEqual(["e:mine", "f:theirs"]);
  });
});

describe("dedupeFeedEvents", () => {
  it("collapses the same event on several calendars", () => {
    const groups = dedupeFeedEvents([
      feed({ id: "a", feedName: "Work", title: "Standup", startTime: "09:00" }),
      feed({ id: "b", feedName: "Team", title: " standup ", startTime: "09:00" }),
      feed({ id: "c", feedName: "Team", title: "Standup", startTime: "10:00" }),
    ]);
    expect(groups.map((g) => g.copies.map((c) => c.id))).toEqual([["a", "b"], ["c"]]);
    expect(groups[0].event.id).toBe("a");
  });
});

describe("visibleCount", () => {
  it("shows everything when it fits", () => expect(visibleCount(3, 3)).toBe(3));
  it("reserves a row for +more when it overflows", () => expect(visibleCount(5, 3)).toBe(2));
  it("never goes negative", () => expect(visibleCount(5, 0)).toBe(0));
});
