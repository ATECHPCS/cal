import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ListChecks, Menu, Rows3, Search, WifiOff } from "lucide-react";
import { formatHeading, type CalendarView, type WeekStartPref } from "../lib/date";
import { usePlanner } from "../stores/planner";
import { useUi } from "../stores/ui";

const VIEWS: { value: CalendarView; label: string; icon: typeof Rows3 }[] = [
  { value: "month", label: "Month", icon: CalendarDays },
  { value: "week", label: "Week", icon: Rows3 },
  { value: "day", label: "Day", icon: CalendarRange },
];

export function TopBar({ weekStart }: { weekStart: WeekStartPref }) {
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const setView = useUi((state) => state.setView);
  const shift = useUi((state) => state.shift);
  const goToday = useUi((state) => state.goToday);
  const openPalette = useUi((state) => state.openPalette);
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const offline = usePlanner((state) => state.offline);
  const pendingOps = usePlanner((state) => state.pendingOps);
  const todoistEnabled = usePlanner((state) => state.todoistEnabled);
  const todoistPanel = useUi((state) => state.todoistPanel);
  const toggleTodoistPanel = useUi((state) => state.toggleTodoistPanel);

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" aria-label="Menu" onClick={toggleSidebar}>
        <Menu size={18} />
      </button>
      <div>
        <h1>{formatHeading(view, anchor, weekStart)}</h1>
      </div>
      {(offline || pendingOps > 0) && (
        <span className="offline-note" title={pendingOps > 0 ? `${pendingOps} change${pendingOps === 1 ? "" : "s"} will sync when back online` : "Offline"}>
          <WifiOff size={11} /> {pendingOps > 0 ? `${pendingOps} pending` : "Offline"}
        </span>
      )}
      <span className="spacer" />
      <div className="nav-group">
        <button type="button" className="icon-btn" aria-label="Previous" onClick={() => shift(-1)}>
          <ChevronLeft size={17} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={goToday}>
          Today
        </button>
        <button type="button" className="icon-btn" aria-label="Next" onClick={() => shift(1)}>
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="seg" role="group" aria-label="Calendar view">
        {VIEWS.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" className={view === value ? "active" : ""} onClick={() => setView(value)}>
            <Icon size={13} />
            <span className="lbl">{label}</span>
          </button>
        ))}
      </div>
      {todoistEnabled && (
        <button
          type="button"
          className={`icon-btn ${todoistPanel ? "active" : ""}`}
          aria-label={todoistPanel ? "Hide Todoist tasks" : "Show Todoist tasks"}
          aria-pressed={todoistPanel}
          title="Todoist"
          onClick={toggleTodoistPanel}
        >
          <ListChecks size={16} />
        </button>
      )}
      <button type="button" className="icon-btn hide-sm" aria-label="Search" onClick={openPalette}>
        <Search size={16} />
      </button>
    </header>
  );
}
