import type { Entry } from "@cal/api-client";
import { CalendarClock, Check, Link2, Repeat, StickyNote } from "lucide-react";
import { useState } from "react";
import { startEntryDrag } from "../lib/dnd";
import { formatTime, formatTimeShort } from "../lib/date";
import { usePlanner } from "../stores/planner";
import { useUi } from "../stores/ui";

const typeIcon = { task: Check, note: StickyNote, link: Link2, event: CalendarClock } as const;

export function EntryChip({
  entry,
  showTime = true,
  shortTime = false,
  checkbox = false,
  className = "",
}: {
  entry: Entry;
  showTime?: boolean;
  shortTime?: boolean;
  /** Always show a tick box on tasks (not just on hover) so they can be ticked on touch screens. */
  checkbox?: boolean;
  className?: string;
}) {
  const openEdit = useUi((state) => state.openEdit);
  const setContextMenu = useUi((state) => state.setContextMenu);
  const updateEntry = usePlanner((state) => state.updateEntry);
  const [dragging, setDragging] = useState(false);
  const TypeIcon = typeIcon[entry.type] ?? Check;
  const showCheck = checkbox && entry.type === "task";

  return (
    <button
      type="button"
      className={`entry-chip color-${entry.color} ${entry.completed ? "done" : ""} ${dragging ? "dragging" : ""} ${showCheck ? "has-check" : ""} ${className}`}
      draggable
      onDragStart={(event) => {
        setDragging(true);
        startEntryDrag(event, entry.id);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={(event) => {
        event.stopPropagation();
        if (entry.type === "link" && entry.linkUrl) {
          window.open(entry.linkUrl, "_blank", "noopener");
        } else {
          openEdit(entry);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ x: event.clientX, y: event.clientY, entry });
      }}
      title={entry.title}
    >
      {showCheck ? (
        <span
          role="checkbox"
          aria-checked={entry.completed}
          aria-label={entry.completed ? `Reopen ${entry.title}` : `Complete ${entry.title}`}
          className={`chip-check ${entry.completed ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            void updateEntry(entry.id, { completed: !entry.completed });
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {entry.completed && <Check size={9} strokeWidth={3.5} />}
        </span>
      ) : (
        <span className="tick" onClick={(e) => e.stopPropagation()}>
          {entry.type === "task" && (
            <TypeIcon
              size={11}
              strokeWidth={3}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                void updateEntry(entry.id, { completed: !entry.completed });
              }}
            />
          )}
        </span>
      )}
      {showTime && entry.startTime && (
        <span className="time">{shortTime ? formatTimeShort(entry.startTime) : formatTime(entry.startTime)}</span>
      )}
      <span className="title">{entry.title}</span>
      {entry.recur !== "none" && <Repeat size={10} className="rep" />}
      {entry.type === "link" && <Link2 size={10} className="rep" />}
    </button>
  );
}
