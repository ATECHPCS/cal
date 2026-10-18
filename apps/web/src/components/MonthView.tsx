import type { Entry, FeedEvent, Holiday } from "@cal/api-client";
import { Plus, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { draggedEntryId, dropTargetProps } from "../lib/dnd";
import { formatDayTitle, formatTime, formatTimeShort, iso, monthMatrix, timeToMinutes, todayIso, weekdayNames, type WeekStartPref } from "../lib/date";
import type { PersonOccurrence } from "../lib/people";
import { buildDayItems, visibleCount, type DayItem } from "../lib/dayItems";
import { useUi } from "../stores/ui";
import { EntryChip } from "./EntryChip";
import { PersonChip } from "./PersonChip";

interface Props {
  anchor: Date;
  entries: Entry[];
  feedEvents: FeedEvent[];
  holidays: Holiday[];
  personDates?: PersonOccurrence[];
  weekStart: WeekStartPref;
  onMoveEntry: (id: string, date: string) => void;
}

// Fallback before the first measurement; the real row count comes from the cell height.
const DEFAULT_CAPACITY = 4;

function FeedChip({ item, compact, className = "" }: { item: Extract<DayItem, { kind: "feed" }>; compact: boolean; className?: string }) {
  const { event, copies } = item;
  const feeds = [...new Set(copies.map((c) => c.feedName))].join(", ");
  return (
    <div
      className={`feed-chip color-${event.color} ${className}`}
      title={`${event.title} — ${feeds}${event.location ? ` · ${event.location}` : ""}`}
    >
      {event.startTime && <span className="time">{compact ? formatTimeShort(event.startTime) : formatTime(event.startTime)}</span>}
      <span className="title">{event.title}</span>
      {copies.length > 1 && (
        <span className="dupes" aria-label={`on ${copies.length} calendars`}>
          ×{copies.length}
        </span>
      )}
    </div>
  );
}

function DayItemChip({ item, compact, onOpenPerson }: { item: DayItem; compact: boolean; onOpenPerson?: () => void }) {
  const cls = compact ? (item.allDay ? "m-allday" : "m-timed") : "";
  if (item.kind === "entry") return <EntryChip entry={item.entry} shortTime={compact} className={cls} />;
  if (item.kind === "feed") return <FeedChip item={item} compact={compact} className={cls} />;
  return <PersonChip occasion={item.person} className={cls} onOpen={onOpenPerson} />;
}

export function MonthView({ anchor, entries, feedEvents, holidays, personDates = [], weekStart, onMoveEntry }: Props) {
  const selectDate = useUi((state) => state.selectDate);
  const selectedDate = useUi((state) => state.selectedDate);
  const openCreate = useUi((state) => state.openCreate);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const today = todayIso();

  const days = useMemo(() => monthMatrix(anchor, weekStart), [anchor, weekStart]);
  const names = useMemo(() => weekdayNames(weekStart), [weekStart]);

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (timeToMinutes(a.startTime) ?? 9999) - (timeToMinutes(b.startTime) ?? 9999) || a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [entries]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) map.set(h.date, map.has(h.date) ? `${map.get(h.date)}, ${h.name}` : h.name);
    return map;
  }, [holidays]);

  const feedByDate = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const event of feedEvents) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (timeToMinutes(a.startTime) ?? 9999) - (timeToMinutes(b.startTime) ?? 9999));
    }
    return map;
  }, [feedEvents]);

  const personByDate = useMemo(() => {
    const map = new Map<string, PersonOccurrence[]>();
    for (const p of personDates) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return map;
  }, [personDates]);

  const itemsFor = (date: string) => buildDayItems(byDate.get(date) ?? [], feedByDate.get(date) ?? [], personByDate.get(date) ?? []);

  // Rows that fit in one day cell. Cells are overflow:hidden with fixed-height
  // rows, so their height only follows the viewport — never their contents.
  const gridRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const cell = grid.querySelector<HTMLElement>(".day-cell");
      if (!cell) return;
      const style = getComputedStyle(cell);
      const row = parseFloat(style.getPropertyValue("--month-row")) || 20;
      const gap = parseFloat(style.rowGap) || 0;
      const head = cell.querySelector<HTMLElement>(".day-head")?.offsetHeight ?? 24;
      const room = cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - head;
      const next = Math.max(1, Math.floor(room / (row + gap)));
      setCapacity((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [days.length]);

  const modalDate = dayModal;
  const modalItems = modalDate ? itemsFor(modalDate) : [];

  return (
    <div className="month-wrap">
      <div className="dow-row">
        {names.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {days.map((day) => {
          const date = iso(day);
          const items = itemsFor(date);
          const isOutside = day.getMonth() !== anchor.getMonth();
          const shown = items.slice(0, visibleCount(items.length, capacity));
          const hidden = items.length - shown.length;
          return (
            <div
              key={date}
              className={`day-cell ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""} ${isOutside ? "outside" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={date}
              onClick={() => selectDate(date)}
              onKeyDown={(event) => {
                if (event.key === "Enter") openCreate(date);
              }}
              onDoubleClick={() => openCreate(date)}
              {...dropTargetProps((event) => {
                const id = draggedEntryId(event);
                if (id) onMoveEntry(id, date);
              })}
            >
              <div className="day-head">
                <span className="day-num">{day.getDate()}</span>
                {holidayByDate.has(date) && <span className="holiday-label">{holidayByDate.get(date)}</span>}
                <button
                  type="button"
                  className="icon-btn day-add"
                  aria-label={`Add entry on ${date}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openCreate(date);
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              {shown.map((item) => (
                <DayItemChip key={item.key} item={item} compact />
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  className="more-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectDate(date);
                    setDayModal(date);
                  }}
                >
                  {`+${hidden}`}<span className="more-word"> more</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {modalDate && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setDayModal(null)}>
          <div className="palette day-modal" role="dialog" aria-label={`Entries on ${modalDate}`}>
            <div className="day-modal-head">
              <h3>{formatDayTitle(modalDate)}</h3>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => {
                  openCreate(modalDate);
                  setDayModal(null);
                }}
              >
                <Plus size={12} /> Add
              </button>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setDayModal(null)}>
                <X size={15} />
              </button>
            </div>
            <div className="day-modal-list">
              {modalItems.map((item) => (
                <DayItemChip key={item.key} item={item} compact={false} onOpenPerson={() => setDayModal(null)} />
              ))}
              {modalItems.length === 0 && <p className="panel-empty">Nothing on this day.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
