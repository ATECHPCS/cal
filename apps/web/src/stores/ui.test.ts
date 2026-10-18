import { beforeEach, describe, expect, it } from "vitest";
import { todayIso } from "../lib/date";
import { useUi } from "./ui";

describe("ui store", () => {
  beforeEach(() => {
    useUi.setState({
      view: "month",
      anchor: new Date(2026, 4, 12),
      selectedDate: "2026-05-12",
      paletteOpen: false,
      editor: { mode: "closed" },
      contextMenu: undefined,
      sidebarOpen: false,
      hiddenTypes: new Set(),
    });
  });

  it("switches view", () => {
    useUi.getState().setView("week");
    expect(useUi.getState().view).toBe("week");
  });

  it("navigates by view granularity", () => {
    useUi.getState().shift(1);
    expect(useUi.getState().anchor.getMonth()).toBe(5); // June
    useUi.getState().setView("week");
    useUi.getState().shift(-1);
    expect(useUi.getState().anchor.getDate()).toBe(5); // one week earlier
    useUi.getState().setView("day");
    useUi.getState().shift(1);
    expect(useUi.getState().anchor.getDate()).toBe(6);
  });

  it("opens create editor with a prefilled date", () => {
    useUi.getState().openCreate("2026-05-20", "09:00");
    const editor = useUi.getState().editor;
    expect(editor.mode).toBe("create");
    if (editor.mode === "create") {
      expect(editor.date).toBe("2026-05-20");
      expect(editor.startTime).toBe("09:00");
    }
  });

  it("toggles type filters", () => {
    useUi.getState().toggleType("note");
    expect(useUi.getState().hiddenTypes.has("note")).toBe(true);
    useUi.getState().toggleType("note");
    expect(useUi.getState().hiddenTypes.has("note")).toBe(false);
  });

  it("toggles hiding completed tasks", () => {
    useUi.setState({ hideCompleted: false });
    useUi.getState().toggleHideCompleted();
    expect(useUi.getState().hideCompleted).toBe(true);
    useUi.getState().toggleHideCompleted();
    expect(useUi.getState().hideCompleted).toBe(false);
  });

  it("goToday resets anchor and selection", () => {
    useUi.getState().setAnchor(new Date(2027, 0, 1));
    useUi.getState().goToday();
    expect(useUi.getState().selectedDate).toBe(todayIso());
  });
});
