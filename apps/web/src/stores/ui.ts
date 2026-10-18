import type { Entry } from "@cal/api-client";
import { create } from "zustand";
import { addDays, addMonths, todayIso, type CalendarView } from "../lib/date";

export interface EditorPrefill {
  title?: string;
  content?: string;
  linkUrl?: string;
  type?: string;
}

export type EditorState =
  | { mode: "closed" }
  | { mode: "create"; date: string; startTime?: string; prefill?: EditorPrefill }
  | { mode: "edit"; entry: Entry };

export interface ContextMenuState {
  x: number;
  y: number;
  entry: Entry;
}

interface UiState {
  view: CalendarView;
  anchor: Date;
  selectedDate: string;
  paletteOpen: boolean;
  editor: EditorState;
  contextMenu?: ContextMenuState;
  sidebarOpen: boolean;
  hiddenTypes: Set<string>;
  hiddenFeeds: Set<string>;
  /** Drop completed tasks from the calendar views. */
  hideCompleted: boolean;
  setView: (view: CalendarView) => void;
  setAnchor: (date: Date) => void;
  shift: (direction: -1 | 1) => void;
  goToday: () => void;
  selectDate: (date: string) => void;
  openPalette: () => void;
  closePalette: () => void;
  openCreate: (date?: string, startTime?: string, prefill?: EditorPrefill) => void;
  openEdit: (entry: Entry) => void;
  closeEditor: () => void;
  setContextMenu: (menu?: ContextMenuState) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleType: (type: string) => void;
  toggleFeed: (id: string) => void;
  toggleHideCompleted: () => void;
  applyDefaultView: (view: CalendarView | undefined) => void;
}

const persisted = (() => {
  try {
    return JSON.parse(localStorage.getItem("cal:ui") ?? "{}") as {
      view?: CalendarView;
      hiddenTypes?: string[];
      hiddenFeeds?: string[];
      hideCompleted?: boolean;
    };
  } catch {
    return {};
  }
})();

function persist(state: Pick<UiState, "view" | "hiddenTypes" | "hiddenFeeds" | "hideCompleted">) {
  try {
    localStorage.setItem(
      "cal:ui",
      JSON.stringify({
        view: state.view,
        hiddenTypes: [...state.hiddenTypes],
        hiddenFeeds: [...state.hiddenFeeds],
        hideCompleted: state.hideCompleted,
      }),
    );
  } catch {
    // no storage (tests, SSR)
  }
}

export const useUi = create<UiState>((set, get) => ({
  // Last-used view wins; fresh devices start on month (settings.defaultView
  // replaces it when the server settings land — see applyDefaultView).
  view:
    persisted.view === "month" || persisted.view === "week" || persisted.view === "day"
      ? persisted.view
      : "month",
  anchor: new Date(),
  selectedDate: todayIso(),
  paletteOpen: false,
  editor: { mode: "closed" },
  contextMenu: undefined,
  sidebarOpen: false,
  hiddenTypes: new Set(persisted.hiddenTypes ?? []),
  hiddenFeeds: new Set(persisted.hiddenFeeds ?? []),
  hideCompleted: persisted.hideCompleted === true,

  setView(view) {
    set({ view });
    persist(get());
  },
  setAnchor(anchor) {
    set({ anchor });
  },
  shift(direction) {
    const { view, anchor } = get();
    if (view === "day") set({ anchor: addDays(anchor, direction) });
    else if (view === "week") set({ anchor: addDays(anchor, direction * 7) });
    else set({ anchor: addMonths(anchor, direction) });
  },
  goToday() {
    set({ anchor: new Date(), selectedDate: todayIso() });
  },
  selectDate(selectedDate) {
    set({ selectedDate, anchor: new Date(`${selectedDate}T12:00:00`) });
  },
  openPalette() {
    set({ paletteOpen: true, contextMenu: undefined });
  },
  closePalette() {
    set({ paletteOpen: false });
  },
  openCreate(date, startTime, prefill) {
    set({ editor: { mode: "create", date: date ?? get().selectedDate, startTime, prefill }, contextMenu: undefined });
  },
  openEdit(entry) {
    set({ editor: { mode: "edit", entry }, contextMenu: undefined });
  },
  closeEditor() {
    set({ editor: { mode: "closed" } });
  },
  setContextMenu(contextMenu) {
    set({ contextMenu });
  },
  toggleSidebar() {
    set({ sidebarOpen: !get().sidebarOpen });
  },
  closeSidebar() {
    set({ sidebarOpen: false });
  },
  toggleType(type) {
    const hiddenTypes = new Set(get().hiddenTypes);
    if (hiddenTypes.has(type)) hiddenTypes.delete(type);
    else hiddenTypes.add(type);
    set({ hiddenTypes });
    persist(get());
  },
  toggleHideCompleted() {
    set({ hideCompleted: !get().hideCompleted });
    persist(get());
  },
  toggleFeed(id) {
    const hiddenFeeds = new Set(get().hiddenFeeds);
    if (hiddenFeeds.has(id)) hiddenFeeds.delete(id);
    else hiddenFeeds.add(id);
    set({ hiddenFeeds });
    persist(get());
  },
  // Server default applies only when this device never chose a view itself.
  applyDefaultView(view) {
    if (!view || persisted.view) return;
    if (get().view !== view) get().setView(view);
  },
}));
